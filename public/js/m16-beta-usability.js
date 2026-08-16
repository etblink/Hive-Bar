'use strict';

(function attachM16BetaUsability(global) {
  const RECHECK_ATTEMPTS = 5;
  const RECHECK_DELAY_MS = 1_500;
  const pendingByForm = new WeakMap();
  const activeByController = new WeakMap();

  function submitButton(form) {
    return form?.querySelector?.('button[type="submit"]') || null;
  }

  function setStatus(form, selector, message) {
    const element = form?.querySelector?.(selector);
    if (!element) return;
    element.textContent = message;
    element.classList.remove('text-red-300');
    element.classList.add('text-gray-300');
  }

  function rememberOriginalLabel(form, button) {
    const existing = pendingByForm.get(form)?.originalLabel;
    return existing ?? button?.textContent ?? '';
  }

  function wallLanding(preflight) {
    if (preflight?.action !== 'wall') return null;
    const operation = preflight.operations?.[0];
    if (!Array.isArray(operation) || operation[0] !== 'transfer') return null;
    const recipient = operation[1]?.to;
    if (typeof recipient !== 'string' || !recipient) return null;
    return `/profile/${encodeURIComponent(recipient)}/wall-posts`;
  }

  function navigate(controller, url) {
    if (typeof controller.m16Navigate === 'function') {
      controller.m16Navigate(url);
      return;
    }
    global.location.assign(url);
  }

  function afterObserved(controller, kind, preflight) {
    if (kind === 'm4') {
      const destination = wallLanding(preflight);
      if (destination) {
        navigate(controller, destination);
        return;
      }
    }
    controller.reload();
  }

  function installPendingUi(form, record, statusSelector) {
    const button = submitButton(form);
    const originalLabel = rememberOriginalLabel(form, button);
    const pending = { ...record, originalLabel };
    pendingByForm.set(form, pending);

    if (button) {
      button.textContent = record.recheckable
        ? 'Recheck Hive confirmation'
        : 'Confirmation pending';
      button.disabled = !record.recheckable;
    }

    if (record.recheckable) {
      setStatus(
        form,
        statusSelector,
        'Keychain approved this action, but Hive-Bar has not confirmed it yet. Do not submit it again. Use “Recheck Hive confirmation” to check the same broadcast without signing or broadcasting again.',
      );
    } else {
      setStatus(
        form,
        statusSelector,
        'Keychain approved this action, but Hive-Bar could not record its confirmation state. Do not submit it again. Reload this page and verify the result on Hive before taking any further action.',
      );
    }
  }

  function clearPendingUi(form) {
    const pending = pendingByForm.get(form);
    const button = submitButton(form);
    if (button && pending) {
      button.textContent = pending.originalLabel;
      button.disabled = false;
    }
    pendingByForm.delete(form);
  }

  async function recheck(controller, form, pending, config) {
    const button = submitButton(form);
    if (button) button.disabled = true;

    try {
      for (let attempt = 0; attempt < RECHECK_ATTEMPTS; attempt += 1) {
        if (attempt > 0) await controller.wait(RECHECK_DELAY_MS);
        const observation = await controller.request(
          `${config.apiPrefix}/preflight/${pending.preflight.id}/observe`,
          {
            method: 'POST',
            csrfToken: pending.csrfToken,
          },
        );
        setStatus(form, config.statusSelector, observation.message);
        if (observation.state === 'observed') {
          clearPendingUi(form);
          afterObserved(controller, config.kind, pending.preflight);
          return;
        }
      }

      setStatus(
        form,
        config.statusSelector,
        'Hive-Bar still has not confirmed this broadcast. Do not submit it again. You can use “Recheck Hive confirmation” again later; rechecking never signs or broadcasts another Hive operation.',
      );
    } catch (error) {
      setStatus(
        form,
        config.statusSelector,
        `Hive-Bar could not recheck this confirmation yet. This does not mean the Hive action failed. Do not submit it again. ${error.message || ''}`.trim(),
      );
    } finally {
      if (pendingByForm.get(form)?.recheckable && button) button.disabled = false;
    }
  }

  function adapterWithBroadcastTracking(adapter, context) {
    return new Proxy(adapter, {
      get(target, property, receiver) {
        if (property === 'broadcast') {
          return async (...args) => {
            const result = await target.broadcast(...args);
            if (result?.accepted) {
              context.broadcastAccepted = true;
              context.transactionId = result.transactionId || null;
            }
            return result;
          };
        }
        const value = Reflect.get(target, property, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  }

  function classifyRequest(context, url, result) {
    if (url === '/auth/session') {
      context.session = result;
      return;
    }
    if (/\/preflight\/[^/]+\/accepted$/.test(url)) {
      context.accepted = result;
      return;
    }
    if (/\/preflight\/[^/]+\/observe$/.test(url)) {
      context.lastObservation = result;
      return;
    }
    if (/\/preflight\/[^/]+$/.test(url) && result?.id && result?.operations) {
      context.preflight = result;
    }
  }

  function patchController(Controller, config) {
    if (!Controller?.prototype || Controller.prototype.m16UsabilityPatched) return;

    const prototype = Controller.prototype;
    const originalRun = prototype.run;
    const originalRequest = prototype.request;

    prototype.request = async function patchedRequest(url, options) {
      const context = activeByController.get(this);
      try {
        const result = await originalRequest.call(this, url, options);
        if (context) classifyRequest(context, url, result);
        return result;
      } catch (error) {
        if (context && /\/preflight\/[^/]+\/accepted$/.test(url)) {
          context.acceptedRequestFailed = true;
        }
        throw error;
      }
    };

    prototype.run = async function patchedRun(form) {
      const existing = pendingByForm.get(form);
      if (existing) {
        if (existing.recheckable) await recheck(this, form, existing, config);
        return;
      }

      const context = {
        form,
        broadcastAccepted: false,
        acceptedRequestFailed: false,
        session: null,
        preflight: null,
        accepted: null,
        lastObservation: null,
      };
      activeByController.set(this, context);

      const originalFactory = this.keychainFactory;
      const originalReload = this.reload;
      this.keychainFactory = () => adapterWithBroadcastTracking(originalFactory(), context);
      if (config.kind === 'm4') {
        this.reload = () => {
          context.reloadRequested = true;
          const destination = wallLanding(context.preflight);
          if (destination) navigate(this, destination);
          else originalReload();
        };
      }

      try {
        await originalRun.call(this, form);
      } finally {
        this.keychainFactory = originalFactory;
        this.reload = originalReload;
        activeByController.delete(this);
      }

      if (!context.broadcastAccepted || context.lastObservation?.state === 'observed') return;

      const canRecheck = Boolean(
        context.preflight?.id &&
        context.session?.csrfToken &&
        context.accepted &&
        !context.acceptedRequestFailed
      );
      installPendingUi(
        form,
        {
          preflight: context.preflight,
          csrfToken: context.session?.csrfToken || null,
          transactionId: context.transactionId || null,
          recheckable: canRecheck,
        },
        config.statusSelector,
      );
    };

    Object.defineProperty(prototype, 'm16UsabilityPatched', {
      value: true,
      enumerable: false,
      configurable: false,
      writable: false,
    });
  }

  patchController(global.HiveBarSocial?.SocialActionController, {
    kind: 'social',
    apiPrefix: '/api/social',
    statusSelector: '[data-social-status]',
  });
  patchController(global.HiveBarM4?.M4ActionController, {
    kind: 'm4',
    apiPrefix: '/api/m4',
    statusSelector: '[data-m4-status]',
  });

  global.HiveBarM16_8 = Object.freeze({ wallLanding });
})(window);
