'use strict';

(function attachImageUpload(global) {
  const IMAGE_HOST = 'https://images.hive.blog';
  const SIGNING_PREFIX = 'ImageSigningChallenge';
  const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
  const UPLOAD_TIMEOUT_MS = 60_000;
  const ACCEPTED_TYPES = new Set(['image/gif', 'image/jpeg', 'image/png', 'image/webp']);
  const SIGNATURE_PATTERN = /^[0-9a-f]{130}$/i;
  const EMPTY_PREVIEW_SRC = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';

  function formatBytes(value) {
    const bytes = Math.max(0, Number(value) || 0);
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function setStatus(container, message, isError = false) {
    const status = container.querySelector('[data-image-status]');
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('image-upload__status--error', isError);
  }

  function validateFile(file) {
    if (!file || typeof file !== 'object') throw new Error('Choose an image first.');
    if (!ACCEPTED_TYPES.has(String(file.type || '').toLowerCase())) {
      throw new Error('Use a PNG, JPEG, WebP, or GIF image.');
    }
    if (!Number.isFinite(file.size) || file.size <= 0) throw new Error('The selected image is empty.');
    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error(`Images must be ${formatBytes(MAX_IMAGE_BYTES)} or smaller.`);
    }
    return file;
  }

  async function createSigningMessage(file) {
    validateFile(file);
    const prefix = new TextEncoder().encode(SIGNING_PREFIX);
    const image = new Uint8Array(await file.arrayBuffer());
    const combined = new Uint8Array(prefix.length + image.length);
    combined.set(prefix, 0);
    combined.set(image, prefix.length);
    return JSON.stringify({ type: 'Buffer', data: Array.from(combined) });
  }

  function requireHostedImageUrl(value) {
    let parsed;
    try {
      parsed = new URL(String(value || ''));
    } catch {
      throw new Error('ImageHoster returned an invalid image URL.');
    }
    if (
      parsed.protocol !== 'https:' ||
      parsed.hostname !== 'images.hive.blog' ||
      parsed.username ||
      parsed.password
    ) {
      throw new Error('ImageHoster returned an unexpected image host.');
    }
    return parsed.toString();
  }

  async function requestSession(fetchImpl) {
    const response = await fetchImpl('/auth/session', {
      method: 'GET',
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.authenticated || !payload.account) {
      throw new Error('Sign in with Hive Keychain before uploading an image.');
    }
    return payload;
  }

  class ImageUploadController {
    constructor({
      fetchImpl = global.fetch ? global.fetch.bind(global) : null,
      keychainFactory = () => new global.HiveBarKeychain.KeychainAdapter(),
      createObjectUrl = (file) => global.URL.createObjectURL(file),
      revokeObjectUrl = (url) => global.URL.revokeObjectURL(url),
      timeoutMs = UPLOAD_TIMEOUT_MS,
    } = {}) {
      this.fetch = fetchImpl;
      this.keychainFactory = keychainFactory;
      this.createObjectUrl = createObjectUrl;
      this.revokeObjectUrl = revokeObjectUrl;
      this.timeoutMs = timeoutMs;
      this.state = new WeakMap();
    }

    stateFor(container) {
      if (!this.state.has(container)) {
        const outputSelector = container.dataset.imageOutput || '';
        const output = outputSelector ? document.querySelector(outputSelector) : container.querySelector('[data-image-url]');
        this.state.set(container, {
          file: null,
          objectUrl: null,
          output,
          initialOutput: output?.value || '',
          uploadedUrl: '',
          lockedAmbiguous: false,
        });
      }
      return this.state.get(container);
    }

    setState(container, value) {
      container.dataset.imageUploadState = value;
    }

    clearObjectUrl(state) {
      if (state.objectUrl) {
        this.revokeObjectUrl(state.objectUrl);
        state.objectUrl = null;
      }
    }

    showPreview(container, file) {
      const state = this.stateFor(container);
      this.clearObjectUrl(state);
      state.objectUrl = this.createObjectUrl(file);
      const preview = container.querySelector('[data-image-preview]');
      const previewShell = container.querySelector('[data-image-preview-shell]');
      const meta = container.querySelector('[data-image-meta]');
      if (preview) preview.src = state.objectUrl;
      if (previewShell) previewShell.hidden = false;
      if (meta) meta.textContent = `${file.name || 'image'} · ${formatBytes(file.size)}`;
    }

    select(container, file) {
      const state = this.stateFor(container);
      if (state.lockedAmbiguous) {
        setStatus(
          container,
          'The previous upload outcome is unclear. Do not retry this attachment from this page.',
          true,
        );
        return false;
      }
      try {
        validateFile(file);
      } catch (error) {
        this.reset(container, { restoreOutput: true, message: error.message, isError: true });
        return false;
      }
      state.file = file;
      state.uploadedUrl = '';
      if (state.output && container.dataset.imageMode !== 'profile') state.output.value = '';
      this.showPreview(container, file);
      const upload = container.querySelector('[data-image-upload-button]');
      const remove = container.querySelector('[data-image-remove]');
      if (upload) upload.disabled = false;
      if (remove) remove.hidden = false;
      this.setState(container, 'selected');
      setStatus(container, 'Preview ready. Nothing has been uploaded yet.');
      return true;
    }

    reset(container, {
      restoreOutput = true,
      message = 'No image selected.',
      isError = false,
    } = {}) {
      const state = this.stateFor(container);
      this.clearObjectUrl(state);
      state.file = null;
      state.uploadedUrl = '';
      const input = container.querySelector('[data-image-file]');
      const preview = container.querySelector('[data-image-preview]');
      const previewShell = container.querySelector('[data-image-preview-shell]');
      const meta = container.querySelector('[data-image-meta]');
      const upload = container.querySelector('[data-image-upload-button]');
      const remove = container.querySelector('[data-image-remove]');
      if (input) input.value = '';
      if (preview) preview.src = EMPTY_PREVIEW_SRC;
      if (previewShell) previewShell.hidden = true;
      if (meta) meta.textContent = '';
      if (upload) upload.disabled = true;
      if (remove) remove.hidden = true;
      if (restoreOutput && state.output) state.output.value = state.initialOutput;
      this.setState(container, state.lockedAmbiguous ? 'ambiguous' : 'empty');
      setStatus(container, message, isError);
    }

    remove(container) {
      const state = this.stateFor(container);
      const hadPublicUpload = Boolean(state.uploadedUrl);
      if (state.output) state.output.value = container.dataset.imageMode === 'profile' ? state.initialOutput : '';
      this.reset(container, {
        restoreOutput: false,
        message: hadPublicUpload
          ? 'Removed from this draft. The previously uploaded image remains public at its hosted URL.'
          : 'Image removed. Nothing was uploaded.',
      });
    }

    async upload(container) {
      const state = this.stateFor(container);
      if (state.lockedAmbiguous) {
        setStatus(container, 'Upload outcome is unclear. Do not retry this attachment.', true);
        return null;
      }
      let file;
      try {
        file = validateFile(state.file);
      } catch (error) {
        setStatus(container, error.message, true);
        return null;
      }
      if (!this.fetch) {
        setStatus(container, 'Image upload is unavailable in this browser.', true);
        return null;
      }

      const uploadButton = container.querySelector('[data-image-upload-button]');
      const fileInput = container.querySelector('[data-image-file]');
      if (uploadButton) uploadButton.disabled = true;
      if (fileInput) fileInput.disabled = true;
      this.setState(container, 'signing');
      setStatus(container, 'Opening Hive Keychain to authorize this image upload. No Hive post is being sent.');

      let postStarted = false;
      try {
        const session = await requestSession(this.fetch);
        const signingMessage = await createSigningMessage(file);
        const signed = await this.keychainFactory().signBuffer({
          account: session.account,
          message: signingMessage,
          title: 'Hive-Bar image upload authorization',
        });
        const signature = String(signed?.signature || '').trim();
        if (!SIGNATURE_PATTERN.test(signature)) {
          throw new Error('Hive Keychain returned an invalid image-upload signature.');
        }

        this.setState(container, 'uploading');
        setStatus(container, 'Uploading one public image. The Hive post has not been sent.');
        const formData = new FormData();
        formData.append('file', file, file.name || 'hive-bar-image');
        const controller = new global.AbortController();
        const timer = global.setTimeout(() => controller.abort(), this.timeoutMs);
        let response;
        try {
          postStarted = true;
          response = await this.fetch(
            `${IMAGE_HOST}/${encodeURIComponent(session.account)}/${encodeURIComponent(signature)}`,
            {
              method: 'POST',
              body: formData,
              mode: 'cors',
              credentials: 'omit',
              cache: 'no-store',
              signal: controller.signal,
            },
          );
        } finally {
          global.clearTimeout(timer);
        }
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          this.setState(container, 'failed');
          setStatus(
            container,
            `ImageHoster rejected the upload (HTTP ${response.status}). No automatic retry was sent. Choose the image again for a new attempt.`,
            true,
          );
          state.file = null;
          if (fileInput) {
            fileInput.disabled = false;
            fileInput.value = '';
          }
          return null;
        }

        const url = requireHostedImageUrl(payload?.url);
        state.uploadedUrl = url;
        if (state.output) state.output.value = url;
        this.setState(container, 'uploaded');
        setStatus(
          container,
          container.dataset.imageMode === 'profile'
            ? 'Image uploaded publicly. Review and save your profile separately to use it.'
            : 'Image uploaded publicly and attached to this draft. The post has not been sent to Hive. Review it separately before publishing.',
        );
        const remove = container.querySelector('[data-image-remove]');
        if (remove) remove.hidden = false;
        return url;
      } catch (error) {
        if (postStarted) {
          state.lockedAmbiguous = true;
          this.setState(container, 'ambiguous');
          setStatus(
            container,
            'The upload request started but its outcome is unclear. Do not retry this attachment from this page; the image may already be public.',
            true,
          );
          return null;
        }
        this.setState(container, 'selected');
        setStatus(container, error.message || 'The image upload was cancelled before any upload request.', true);
        if (uploadButton) uploadButton.disabled = false;
        return null;
      } finally {
        if (fileInput && !state.lockedAmbiguous) fileInput.disabled = false;
      }
    }

    blocksSubmit(form) {
      const container = form.querySelector('[data-image-upload]');
      if (!container) return false;
      const state = container.dataset.imageUploadState || 'empty';
      if (['empty', 'uploaded'].includes(state)) return false;
      const messages = {
        selected: 'Upload or remove the selected image before reviewing this action.',
        signing: 'Finish or cancel the Keychain image authorization before continuing.',
        uploading: 'Wait for the image upload to finish before reviewing this action.',
        failed: 'Choose the image again or remove it before continuing.',
        ambiguous: 'This image upload has an unclear outcome. Do not publish or retry it from this page.',
      };
      setStatus(container, messages[state] || 'Resolve the image attachment before continuing.', true);
      return true;
    }

    bind(container) {
      const fileInput = container.querySelector('[data-image-file]');
      const upload = container.querySelector('[data-image-upload-button]');
      const remove = container.querySelector('[data-image-remove]');
      this.stateFor(container);
      this.setState(container, 'empty');
      fileInput?.addEventListener('change', () => this.select(container, fileInput.files?.[0] || null));
      upload?.addEventListener('click', () => this.upload(container));
      remove?.addEventListener('click', () => this.remove(container));
    }
  }

  const controller = new ImageUploadController();
  for (const container of document.querySelectorAll('[data-image-upload]')) controller.bind(container);
  document.addEventListener('submit', (event) => {
    const form = event.target.closest('form');
    if (form && controller.blocksSubmit(form)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  global.HiveBarImageUpload = Object.freeze({
    ACCEPTED_TYPES,
    IMAGE_HOST,
    MAX_IMAGE_BYTES,
    SIGNING_PREFIX,
    ImageUploadController,
    createSigningMessage,
    requireHostedImageUrl,
    validateFile,
  });
})(window);
