# Hive-Bar M15.3 Core Social Surfaces

Status: **CORRECTED CANDIDATE IMPLEMENTATION — OWNER REVIEW REQUIRED**

## 1. Binding

M15.3 is rooted directly at accepted M15.2 source:

- source branch: `codex/m6-read-only-release-readiness`
- parent commit: `7ede3a21b2ebe2065bae662aff82557cfcd05962`
- parent tree: `ab156ac4e39f0bfe89526cbfdc9d8e15f2e0635b`
- governing specification: `docs/HIVE_BAR_M15_UI_UX_MODERNIZATION_SPECIFICATION_0_1_0.md`
- shell/design primitives: `docs/M15_2_APPLICATION_SHELL_AND_DESIGN_PRIMITIVES.md`

M15.3 is source-only and presentation-only. It does not authorize or perform a Privex deployment, Hive write, Keychain transaction request, payment-window activation, payment-semantic change, Distriator activation, DNS/Cloudflare/Caddy change, or PR #1 mutation.

## 2. Purpose

M15.3 modernizes the four approved core social surfaces while preserving the accepted server-rendered EJS + HTMX architecture and all existing authority boundaries:

1. Home / Bar Feed
2. Community
3. Conversation
4. Profile

It changes visual hierarchy and interaction presentation only. It creates no route, Hive RPC method, social action, signer, persistence layer, search system, recommendation system, event system, notification system, live-presence system, or Following-feed aggregator.

## 3. Audit result

The accepted application already exposes all data required for this pass:

- Home receives a bounded list of official community-root posts.
- Community already exposes metadata, posts, Threads, sort controls, membership state, and the existing controlled post composer.
- Conversation already exposes the complete post, sanitized comments, the existing controlled comment composer, and existing vote controls.
- Profile already exposes public identity, blog posts, public wallet, wall, followers, following, and owner-only Inbox/Settings.

Therefore M15.3 changes no `routes/`, service, authentication, social-write, payment, release-gate, environment, operations, or deployment file.

## 4. Presentation architecture

M15.3 adds one local stylesheet:

`public/css/m15-social.css`

`views/common/head.ejs` loads it after `/css/style.css`. The file uses accepted `--hb-*` tokens and contains no remote URL, external font, script, or executable markup. Ordinary feed items are separator-based rather than card-heavy; bordered panels remain reserved for semantic modules.

## 5. Home / Bar Feed

Home is reordered around social content:

1. compact venue-led identity hero;
2. official Bar Feed;
3. visit information;
4. community introduction;
5. owner-approved venue photography.

The old generated brand-poster is replaced by the exact local 4th Street Bar logo. Official updates become a separator-based feed while retaining existing official-post filtering, titles, excerpts, links, empty state, and unavailable state.

The existing community-preview grid remains explicitly responsive with `lg:grid-cols-2`, preserving the repository's established 360 CSS-pixel responsive contract.

M15.3 does not add For You, aggregated Following, Nearby, Live, Events, search, recommendations, notifications, or presence.

## 6. Community

The Community page becomes venue-led and feed-first:

- exact local bar logo and current Hive community title/identifier anchor the page;
- Community posts and Threads remain the only content tabs;
- the feed is primary document content;
- community metadata is secondary;
- sort remains `created`, `trending`, `hot`, and `payout` through existing HTMX endpoints;
- the controlled post composer remains behind `hiveSession && canWriteAction('post')`;
- subscribe/unsubscribe retains existing session, state, and controlled-write gating.

## 7. Conversation

The post page becomes a focused conversation column. Author identity precedes the current post title, body remains sanitized `bodyHtml`, existing vote/payout metadata remains visible, and comments use a quieter depth-line treatment. The controlled comment form remains behind `hiveSession && canWriteAction('comment')`; the existing vote partial remains unchanged.

No optimistic success state or invented engagement metric is added.

## 8. Profile

Profile changes from a dashboard-style sidebar to a social identity page:

- avatar, display name, Hive handle, bio, follower/following counts, post count, and reputation are grouped in one identity header;
- follow/unfollow retains its existing gate and current on-chain-state message;
- content navigation becomes horizontally scrollable tabs;
- public tabs remain exactly Blog posts, Public wallet, Wall, Followers, and Following;
- Inbox and Settings remain owner-only;
- blog posts use the same separator-based feed treatment.

The corrected implementation uses a non-landmark outer profile layout and a single labelled profile-identity section. This preserves unique landmark names and avoids invalid ARIA on the profile statistics container.

## 9. Capability and authority invariants

M15.3 preserves:

- `/explore` and `/create` as unavailable routes;
- browser-local Hive Keychain identity/signing boundaries;
- all existing `canWriteAction(...)` checks;
- all existing social preflight/review flows;
- all existing post/comment/vote/follow/subscribe operation semantics;
- owner-only Inbox/Settings authorization;
- all payment and M14.4 behavior untouched;
- no inline SVG in rendered shared/social UI;
- no server-side Hive private-key handling;
- no external UI asset dependency.

## 10. Automated M15.3 checks

`test/m15-social-surfaces.test.js` verifies Home feed order/capability honesty, exact Community tabs and write gating, the known Conversation fixture plus preserved comment/vote source gates, the current Profile tabs and owner-only boundary, and local token-driven CSS with no remote assets.

All pre-existing CI, XSS, accessibility, responsive, authorization, Hive-write, payment, and runtime gates remain authoritative.

## 11. Corrective-pass provenance

The first PR #7 candidate exposed four deterministic presentation/test failures while all existing blockchain/payment/security behavior remained intact:

- duplicate profile landmark names from nesting two sections under the same heading;
- invalid `aria-label` use on a generic profile statistics `div`;
- loss of the pre-existing explicit Home `lg:grid-cols-2` responsive marker;
- a new M15.3 test that mistook fixture body text (`Pull up a stool`) for the fixture post title.

The corrected candidate:

- makes the outer profile shell a non-landmark container;
- keeps one uniquely labelled profile-identity section;
- removes the invalid statistics ARIA label;
- restores an actual two-column responsive marker on the existing Home community preview;
- tests the real fixture title while still asserting its known body text;
- rewrites the temporary branch to one clean commit rooted directly at accepted M15.2.

No security or accessibility gate is weakened.

## 12. Files changed

The corrected candidate changes exactly 18 presentation/test/documentation files:

- `views/common/head.ejs`
- `public/css/m15-social.css`
- `views/pages/home/index.ejs`
- `views/pages/home/partials/hero.ejs`
- `views/pages/home/partials/latest-updates.ejs`
- `views/pages/home/partials/community.ejs`
- `views/pages/community/partials/community-content.ejs`
- `views/pages/community/partials/community-info-card.ejs`
- `views/pages/community/partials/community-post-list.ejs`
- `views/common/post.ejs`
- `views/pages/post/index.ejs`
- `views/partials/full-post.ejs`
- `views/common/comment.ejs`
- `views/pages/profile/partials/profile-content.ejs`
- `views/pages/profile/partials/profile-info-card.ejs`
- `views/pages/profile/partials/user-blog-posts.ejs`
- `test/m15-social-surfaces.test.js`
- `docs/M15_3_CORE_SOCIAL_SURFACES.md`

No route, service, social-write, payment, release-gate, environment, operations, deployment, or existing binary asset file changes.

## 13. Acceptance gate

M15.3 source acceptance requires:

- exact parent `7ede3a21b2ebe2065bae662aff82557cfcd05962`;
- exactly one commit ahead and zero behind accepted source;
- exactly the 18 declared changed files;
- existing exact logo asset unchanged;
- no route/payment/social-write/operations/deployment changes;
- Ubuntu and Windows deterministic CI pass;
- all existing security/accessibility/responsive tests pass;
- all M15.2 shell/logo tests pass;
- all M15.3 social-surface tests pass;
- no `/explore` or `/create` route;
- no Hive write, Keychain request, payment activation, or Privex deployment;
- PR #1 untouched.

After accepted M15.3 integration, M15.4 may modernize Wallet/Pay while preserving the accepted M14 payment safety model. Deployment remains a separate authorization boundary.
