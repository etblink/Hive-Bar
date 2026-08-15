# Hive-Bar M15 UI/UX Modernization Specification 0.1.0

Status: **CANDIDATE SPECIFICATION — OWNER APPROVAL REQUIRED BEFORE UI IMPLEMENTATION**

This document defines M15.0 (accepted-interface audit) and M15.1 (formal UI/UX specification). It is a source-only design-governance artifact. It does **not** authorize a production deployment, Privex change, Hive write, Keychain request, payment-window activation, payment-semantic change, new Hive RPC primitive, new social-write primitive, or any modification to the M14.4 genuine-purchase boundary.

## 1. Binding and precedence

M15.0/M15.1 is rooted at the accepted Hive-Bar source of truth:

- branch: `codex/m6-read-only-release-readiness`
- commit: `7519d2ee3416c5769312935df71bc29b51f22261`
- tree: `07e65285e7c6aac9126eb547f199e87208dd1f24`
- canonical host: `fourthstreetbar.com`
- community: `hive-108590`
- official bar account: `fourthstreetbar`
- threads container: `fourthst.threads`

When sources disagree, implementation must follow this precedence:

1. accepted security, payment, authority, and release gates;
2. accepted application behavior and route semantics;
3. this M15 UI/UX specification;
4. owner-approved mockups and design references;
5. generated concept imagery.

The mockups are directional references, not executable requirements. No element shown only in a mockup becomes a product capability by appearance alone.

## 2. Product design charter

Hive-Bar should feel like a modern social product first and a blockchain client second.

The visible brand hierarchy is:

1. **4th Street Bar** — primary venue/community identity;
2. **Hive-Bar** — product layer and application identity;
3. **Hive** — underlying public network and transaction substrate.

The target experience is approximately **90% familiar modern social UX and 10% unmistakably 4th Street Bar**. Familiarity should come from navigation, feed structure, profile anatomy, conversation behavior, hierarchy, touch targets, and predictable controls. Distinctiveness should come from the real 4th Street Bar logo, approved venue photography, restrained amber/bar-light accents, copy tone, and venue-centered community organization.

The UI must not become a generic “Web3 dashboard.” Blockchain details are surfaced when they affect consent, money, security, provenance, or truthfulness; otherwise they remain secondary to people, content, and the bar.

## 3. Capability classification

Every M15 design element is classified as one of the following.

- **CURRENT** — directly implemented in the accepted source.
- **DERIVED** — may be composed from already implemented reads, routes, static assets, or semantics without adding a new Hive capability.
- **FUTURE** — requires new product semantics, new aggregation, new data, new write capability, or separate milestone approval. It must not appear as an active production control during M15 unless separately implemented and accepted.
- **APPROVED DESIGN INPUT** — owner-provided visual material approved for design direction but not necessarily present in the repository yet.

This classification is binding. Disabled fake controls, invented counts, invented events, invented balances, invented verification badges, or decorative states that resemble real functionality are not acceptable production substitutes.

## 4. M15.0 accepted-interface inventory

### 4.1 Public presentation routes

| Current route | Current capability | M15 target surface | Class |
| --- | --- | --- | --- |
| `/` | Venue hero, visit details, approved photos, three bounded official community posts | Home / Bar Feed shell | CURRENT + DERIVED |
| `/community` | Community metadata, membership state, paginated posts | Community | CURRENT |
| `/community/threads` | Latest threads from `fourthst.threads` | Community → Threads | CURRENT |
| `/post/:author/:permlink` | Full post, sanitized body, comments, vote state | Conversation | CURRENT |
| `/profile/:username` | Public identity, blog posts, follow state | Profile → Posts | CURRENT |
| `/profile/:username/wallet` | Public Hive wallet/rewards/mana presentation | Profile → Wallet | CURRENT |
| `/profile/:username/wall-posts` | Public qualifying wall messages | Profile → Wall | CURRENT |
| `/profile/:username/followers` | Paginated followers | Connections view | CURRENT |
| `/profile/:username/following` | Paginated following | Connections view | CURRENT |
| `/profile/:username/inbox` | Owner-only encrypted inbox history | You → Inbox | CURRENT |
| `/profile/:username/settings` | Owner-only profile/settings controls | You → Settings | CURRENT |
| `/pay` | Verified V4V/Hive URI intake, exact review, durable receipt state | Pay | CURRENT |

### 4.2 Existing interaction layers

The accepted client already contains separate browser modules for Keychain authentication, Keychain adaptation, social actions, M4 actions, and Pay Tab behavior. M15 must preserve those boundaries. Presentation refactoring must not move private-key handling onto the server, invent hidden signing, bypass exact-operation review, or merge social and payment authorization paths.

### 4.3 Existing reusable presentation pieces

The current UI already has reusable primitives for:

- global header/footer;
- post summaries and full posts;
- flattened comment rendering with bounded visual depth;
- vote controls;
- buttons, tabs, state cards, stat tiles, wallet panels, prose, and beer visualization;
- HTMX partial replacement for community and profile views;
- empty/unavailable/error states;
- responsive venue photography.

M15 should evolve these primitives rather than replace server-rendered progressive enhancement with a client-only application.

### 4.4 Existing strengths that must survive

The accepted UI foundation already provides:

- server-rendered EJS documents and progressive HTMX enhancement;
- semantic HTML and one `main#main-content` target;
- keyboard skip navigation;
- visible `:focus-visible` treatment;
- 320 px minimum document support and automated 360 CSS-pixel contracts;
- reduced-motion handling;
- local HTMX and QR-reader runtime assets;
- CSP-compatible no-inline-script architecture;
- sanitized rich post/comment content;
- distinct signed-out, unavailable, empty, owner-only, and controlled-write states;
- accessible structural validation and serious/critical axe gates;
- explicit contrast tests for primary text pairs.

M15 is not allowed to trade these properties for visual polish.

## 5. Audit findings and modernization targets

### 5.1 Current shell

The current global header exposes Home, Community, Pay Tab, account/sign-in, and sign-out in a conventional responsive website header. It is robust but does not feel like a persistent social application.

**M15 target:** replace presentation with a stable application shell while keeping the same authenticated/session semantics.

### 5.2 Home

The current home page behaves primarily as a venue landing page with a large hero, official updates, photography, community link, and visit information.

**M15 target:** make social/community activity the dominant repeat-visit surface while preserving venue identity and visit information. The initial Bar Feed may reuse existing community and official-post reads; no new personalization algorithm is implied.

### 5.3 Community

The current Community screen uses a desktop-oriented information-card/sidebar plus Posts/Threads content tabs. It exposes correct metadata and membership semantics but gives “community database page” more prominence than “digital bar.”

**M15 target:** venue-first hero identity, then current membership, Posts, Threads, About, and approved Photos. Community subscription remains an on-chain social action and must retain exact preflight/review behavior even if the visible label becomes friendlier (for example, `Join`).

### 5.4 Conversation

The current full-post view is content-safe and structurally strong, but comments are rendered as repeated rounded cards with margin-based depth.

**M15 target:** an original-post anchor followed by a conversation-first thread. Use subtle connective lines/spacing rather than a card around every reply. Preserve the flattened server model and all comment depths; cap only *visual indentation* to prevent narrow-screen collapse.

### 5.5 Profile

The current profile presents identity in a left information card and seven possible content tabs (Posts, Wallet, Wall, Followers, Following, Inbox, Settings). This is functionally complete but creates a dashboard-like hierarchy.

**M15 target:** human-first identity at the top. Followers and Following become prominent count links rather than permanent tabs. Public primary sections are Posts, Wall, and Wallet; owner-only Inbox and Settings move into the `You` account area or an owner menu. Reputation and protocol-heavy values remain available but visually secondary.

### 5.6 Pay

The current Pay Tab correctly prioritizes warnings, exact V4V/Hive URI validation, Keychain authority boundaries, and independent chain confirmation. Its wording is intentionally technical because correctness was the primary milestone objective.

**M15 target:** a calmer merchant/payment hierarchy without changing one byte of payment meaning. The UI must never manufacture itemized bar orders, USD equivalence, balances, invoice references, merchant metadata, or confirmation estimates that are not actually provided by accepted data. The visual concepts showing itemized drinks are **not** current functionality.

## 6. Target information architecture

### 6.1 Mobile target navigation

The long-term target is:

`Home · Explore · Create · Pay · You`

Rules:

- **Home** is CURRENT/DERIVED and opens the Bar Feed experience.
- **Explore** is initially DERIVED as a venue/community discovery hub using existing Community, Threads, approved Photos, and Visit information. Search, people discovery, recommendation ranking, nearby venues, and global discovery are FUTURE.
- **Create** is a context/action launcher over existing accepted social actions. It must be hidden, disabled, or truthfully unavailable when the accepted write gate does not permit an action. It must never imply that posting is generally open.
- **Pay** is CURRENT and routes to the accepted Pay Tab presentation.
- **You** is CURRENT/DERIVED and resolves to the verified user profile/account hub when signed in; signed-out state opens the Keychain sign-in path rather than a fake profile.

The Community remains a first-class conceptual destination even when not a permanent mobile bottom-nav item. It is reachable from Home and Explore and receives a dedicated desktop rail item.

### 6.2 Desktop target navigation

At large desktop widths, use a persistent left rail:

- 4th Street Bar identity
- Home
- Explore
- Create
- Community
- Pay
- You

Messages/Inbox appears only for a verified owner context and should not be presented as a generic direct-messaging product unless its current encrypted-inbox semantics are accurately represented.

### 6.3 Reserved future tabs

The following concepts from mockups are **FUTURE** and must not ship as active M15 controls without a separate capability milestone:

- `Live` feed/presence;
- aggregated `Following` feed;
- formal Events system, attendance counts, RSVP/Interested state;
- people search/recommendation engine;
- generalized notifications product;
- venue check-ins/presence;
- additional bars/nearby venues;
- reward/perk gamification not already backed by accepted Hive data.

## 7. Brand system

### 7.1 Primary identity

The owner-supplied original black-and-white distressed `4TH ST. / BAR` logo is an **APPROVED DESIGN INPUT** and becomes the primary venue mark for M15 implementation.

Rules:

- preserve the original distressed character; do not redraw it into a clean tech logo;
- default treatment is white logo on black/dark photography;
- do not recolor the entire logo amber;
- use the full mark for Community hero, About, Pay merchant identity, sign-in/entry moments, and large desktop branding;
- do not use the full detailed mark where its letter distress becomes illegible.

The source binary supplied outside the repository must be added later under an implementation-specific asset commit with an explicit filename/hash review. M15.0/M15.1 does not silently ingest or recreate it.

### 7.2 Compact venue mark

A compact mark may be derived from the distinctive `4` / `4TH ST.` portion for avatars, favicons, small rail marks, and merchant badges.

It must remain visibly derived from the actual venue logo. A generic bee, blockchain, hexagon, or unrelated Hive mark must not replace venue identity in primary navigation.

### 7.3 Hive-Bar/Hive attribution

`Hive-Bar` and `Powered by Hive` may appear as restrained product/technology attribution in About, sign-in, wallet, transaction, and footer contexts. They should not visually outrank the bar name.

### 7.4 Approved photography

The accepted repository already contains four owner-approved venue photographs:

- `fourth-street-bar-bartender.jpg`
- `fourth-street-bar-exterior.jpg`
- `fourth-street-bar-patio.jpg`
- `fourth-street-bar-pool-table.jpg`

M15 should prefer these known assets over invented/generated venue photography in production UI. Generated imagery remains concept-only unless separately owner-approved and added deliberately.

## 8. Design tokens

M15 implementation should consolidate current Tailwind utility styling around semantic tokens. Initial token intent:

```text
--hb-bg:              #050505
--hb-surface:         #111113
--hb-surface-raised:  #1A1A1D
--hb-surface-strong:  #242428
--hb-border:          #34343A
--hb-text:            #F5F5F2
--hb-text-muted:      #D1D5DB
--hb-text-subtle:     #9CA3AF
--hb-accent:          #F4A460
--hb-accent-hover:    #F6C27A
```

`#F4A460` remains the initial Bar Gold because it is already present in the accepted UI and already covered by contrast testing. Any later accent-color change requires explicit contrast revalidation.

Amber is a scarce semantic accent. Reserve it for:

- active navigation/selection;
- primary CTA emphasis;
- venue identity detail;
- reviewed/meaningful interactive state.

Do not turn every border, icon, count, heading, and card gold.

### 8.1 Typography

The distressed logo remains image artwork, not application body typography.

Initial UI typography should use a local/system sans stack to avoid an external-font dependency:

`ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`

A bundled font such as Inter may be evaluated later only if locally vendored, license-reviewed, performance-tested, and CSP-compatible.

Type hierarchy should use weight/size/spacing rather than multiple decorative typefaces.

### 8.2 Spacing and geometry

Use a 4 px base rhythm with preferred steps of 4, 8, 12, 16, 24, 32, 48, and 64 px.

Preferred radii:

- controls: 8–12 px;
- semantic cards/modules: 12–16 px;
- hero/media panels: up to 20–24 px;
- pills: fully rounded only for chips/status.

Minimum interactive target: **44 × 44 CSS px**.

Ordinary feed posts should not all sit inside floating rounded dashboard cards. On small screens, use whitespace and subtle separators for the normal feed; reserve bordered/raised cards for semantic modules such as events (future), wallet summaries, payment review, errors, and venue information.

## 9. Responsive layout contract

### 9.1 Small mobile — 320–639 px

- one content column;
- fixed/sticky bottom navigation may be used only with safe-area padding and without obscuring forms, reply composers, or payment controls;
- top bar remains compact and content-first;
- feed media is full content width;
- no horizontally scrolling essential controls;
- thread indentation is visually capped;
- existing 360 px automated contract remains mandatory.

### 9.2 Tablet / compact desktop — 640–1023 px

- content remains primarily single-column with optional contextual modules below/above;
- bottom navigation may transition to compact side/rail only when the resulting touch/keyboard model remains stable;
- avoid a completely different information architecture between tablet and desktop.

### 9.3 Desktop — 1024 px and above

- persistent left navigation rail;
- social content column generally capped around 680–760 px for readability;
- optional right context column only when useful and only at sufficiently wide widths;
- ordinary posts should not expand across the full viewport;
- Community/About and wallet information may use contextual side panels without displacing the primary conversation/feed hierarchy.

## 10. Core component specification

### 10.1 App shell

Must provide:

- venue mark/name;
- primary navigation with visible current state;
- signed-in avatar/account entry or a truthful sign-in entry;
- desktop and mobile variants with the same conceptual destinations;
- skip link and semantic navigation labels;
- no primary action represented by icon alone unless an accessible name is present.

### 10.2 Post row/card

Order:

1. avatar;
2. display name;
3. `@handle`;
4. time;
5. optional truthful venue/official context;
6. text/content;
7. media if present;
8. social actions.

Hive payout/reward values may remain available but should not dominate the social hierarchy. Vote controls may use familiar iconography, but accessible text must preserve accurate Hive semantics.

### 10.3 Conversation

- keep original post visually anchored;
- show reply count and sorting only if the sorting behavior truly exists;
- visual nesting uses connectors/spacing rather than repeated heavy cards;
- cap visual indentation after approximately three levels while retaining actual relationship/depth semantics;
- comment/reply composers are shown only when the accepted controlled-write gate permits the relevant action;
- signed-out/read-only users see truthful non-action states, not inert text boxes that imply posting availability.

### 10.4 Community

Hero should combine:

- approved venue photography;
- actual full/compact 4th Street Bar mark;
- `4th Street Bar` name;
- Reno, Nevada;
- truthful member/subscriber count;
- truthful community description;
- membership state.

Initial tabs/sections:

- Posts — CURRENT;
- Threads — CURRENT;
- Photos — DERIVED from approved static venue media until a real media feed exists;
- About — CURRENT/DERIVED from community + venue information.

`Live` and Events are FUTURE and omitted from active production navigation in M15.

A friendly `Join` label may map to Hive community subscription only if the exact-action review continues to reveal what will be signed. No hidden automatic subscribe is allowed.

### 10.5 Profile / You

Public profile priority:

1. avatar;
2. display name and handle;
3. bio/about;
4. location/website only when current profile metadata safely provides them;
5. follower/following counts;
6. follow state/action when authorized;
7. content.

Primary public content:

- Posts;
- Wall;
- Wallet.

Follower/Following lists open from counts or a connections view.

Owner-only functions:

- Inbox;
- Settings;
- reward claim/profile update controls already supported by M4.

These owner tools should feel like account functions, not public-profile tabs.

### 10.6 Wallet

Keep the accepted beer/HP personality where it helps brand distinctiveness, but organize data using plain labels and progressive disclosure. Never relabel units into a misleading conventional-currency balance.

Public wallet data, rewards, mana, HIVE, HBD, and HP must remain accurately distinguished.

### 10.7 Pay

The M14 payment model is presentation-invariant and frozen for M15.

Required truths remain visible at the correct stages:

- verified payer identity;
- merchant `fourthstreetbar`;
- exact canonical HBD amount;
- exact memo;
- exact operation/fingerprint before Keychain;
- authority = Active;
- Keychain acceptance is not Paid;
- pending/ambiguous state does not authorize a retry;
- Paid requires accepted independent-node irreversible confirmation;
- Distriator remains separately controlled and cannot be implied by visual design.

The Pay UI should use a state-oriented flow:

`Invoice input → Exact review → Awaiting Keychain → Broadcast accepted/pending → Chain confirmed`

A previous durable receipt may remain visible in read-only observation mode.

The following mockup elements are prohibited unless actual data/capability later exists:

- invented itemized drink order;
- invented USD conversion;
- invented HBD wallet balance;
- invented POS reference number;
- invented confirmation time estimate;
- generic green `Payable` state not backed by accepted validation.

## 11. Explore specification

M15 may implement an Explore hub without new Hive primitives by composing:

- Community Posts;
- Threads;
- approved venue Photos;
- About/Visit information;
- direct links into known profile/community surfaces.

The initial Explore page must not pretend to be global search.

FUTURE additions requiring separate scope include:

- account/post search;
- recommendation ranking;
- nearby venues;
- trending topics;
- algorithmic discovery;
- saved/custom feeds.

## 12. Create specification

`Create` is a launcher, not a new authority model.

It may surface only actions already accepted and currently authorized by the relevant release gate. Examples may include Post, Thread, Comment, or other existing social actions when their exact existing preflight is active.

In normal write-disabled production state, Create must either:

- be absent;
- open a truthful read-only explanation; or
- expose only non-writing preparatory UI that cannot cross into Keychain.

It must not create a broad always-on posting surface by redesign alone.

## 13. Authentication UX

Current authentication uses Hive Keychain and verified server sessions. M15 may move sign-in from the current header `<details>` control into a dedicated `You`/account sheet or page, but semantics remain:

- user enters only account name;
- Keychain performs the signature interaction;
- no private key is entered into Hive-Bar;
- sign-in authority and transaction authority remain visibly distinct;
- failure, cancellation, locked Keychain, missing Keychain, and account mismatch remain distinguishable.

## 14. State matrix

Every redesigned surface must deliberately handle relevant states.

### Global

- signed out;
- signed in;
- read-only write-disabled;
- controlled action available;
- rate limited;
- not found;
- generic safe error.

### Data views

- loading/progressive request;
- ready;
- empty;
- partially unavailable while parent surface remains available;
- continuation/pagination available;
- end of results.

### Social actions

- unavailable;
- preflight prepared;
- exact review required;
- awaiting Keychain;
- cancelled;
- accepted/pending observation;
- confirmed where the existing action has confirmation semantics;
- ambiguous/timeout with no automatic retry.

### Payment

Use the exact accepted receipt lifecycle and M14 semantics. Visual states must never skip or merge safety states for simplicity.

## 15. Accessibility and input requirements

M15 acceptance must retain and extend the existing gates.

Required:

- valid structural HTML for key public and controlled documents;
- no serious or critical axe violations;
- WCAG AA contrast for normal text and interactive states;
- keyboard-operable navigation, tabs, menus, dialogs/sheets, forms, and payment review;
- `:focus-visible` treatment at least as visible as the accepted baseline;
- one main landmark and preserved skip link;
- labels for icon-only controls;
- no state communicated by color alone;
- minimum 44 px touch target for primary controls;
- reduced-motion support;
- semantic heading order;
- live-region announcements only where useful and non-noisy;
- no bottom navigation/composer overlap at 320/360 px widths;
- zoom/reflow tolerance without fixed-width essential UI.

Do not disable color-contrast checking in new M15-specific tests merely because the pre-existing generic axe run does so; explicit token/contrast tests should cover the new palette.

## 16. Motion and micro-interactions

Motion is supporting feedback, never decoration that blocks use.

Default transitions should generally be approximately 120–180 ms using opacity/transform/background changes. Avoid large parallax, persistent shimmer, autoplay motion, or essential state encoded only through animation.

`prefers-reduced-motion: reduce` must collapse nonessential transitions.

## 17. Iconography

Use one coherent outline icon system with rounded geometry and approximately 1.75–2 px visual stroke at common sizes.

Implementation may use locally authored SVG or a locally vendored, pinned, license-reviewed icon package. No CDN icon runtime is allowed.

Emoji may appear in user content but should not be the primary application navigation icon system.

## 18. Copy and terminology

Prefer human product language where it remains truthful:

- `Join` may visually replace `Subscribe` at the Community CTA while exact review identifies the Hive subscription operation;
- `You` may replace a raw account handle as primary navigation;
- `Pay` may replace `Pay Tab` in compact navigation;
- `Conversation` may replace a protocol-oriented post-detail label.

Do not euphemize safety-critical concepts. Keep `Active authority`, `Keychain`, exact HBD amount, merchant, memo, operation fingerprint, and irreversible confirmation where required by payment/review semantics.

Avoid unnecessary `M3`, `M4`, `M5`, `M14`, RPC, Hivemind, AppBase, VESTS, or release-gate terminology in ordinary user-facing copy unless the user is explicitly viewing advanced/protocol information.

## 19. Performance and security constraints

M15 presentation work must preserve:

- current CSP/no inline executable script posture;
- local static runtime assets;
- no external font dependency by default;
- no private keys or secrets in HTML, JavaScript, data attributes, logs, or CSS;
- sanitized user-generated HTML;
- bounded request bodies and route validation;
- HTMX/full-navigation equivalence;
- server authority over identity, exact operations, payment records, and allowed actions.

Hero/logo photography must be responsive and sized intentionally. Do not add large unoptimized generated images directly to production pages.

## 20. Implementation sequence after specification approval

### M15.2 — Application shell and primitives

- semantic design tokens;
- real 4th Street Bar logo asset integration with exact hash review;
- mobile bottom navigation and desktop left rail;
- top bar/account affordance;
- button, input, chip, state, feed-row, avatar, and icon primitives;
- responsive content-width system;
- no feature-semantic changes.

### M15.3 — Core social surfaces

Recommended order:

1. Home / Bar Feed;
2. Community;
3. Conversation;
4. Profile / You;
5. Explore derived hub.

Existing writes remain gated. Following Feed, Live, Events, and search remain FUTURE unless separately scoped.

### M15.4 — Wallet and Pay presentation

- wallet hierarchy modernization;
- preserve beer/HP personality selectively;
- Pay state machine presentation;
- exact M14 review/receipt semantics unchanged;
- payment-specific accessibility and ambiguity tests.

### M15.5 — Cross-platform and visual acceptance

Required review widths should include at least:

- 320/360 px narrow mobile structural check;
- approximately 390 px contemporary mobile;
- 768 px tablet;
- 1024 px compact desktop;
- 1440 px desktop.

Acceptance requires keyboard review, reduced motion, signed-out/signed-in/read-only/controlled fixtures, sparse community state, empty threads, long post/comment content, pagination, owner-only pages, error/unavailable states, and payment pending/confirmed/ambiguous states.

## 21. Test and CI acceptance

Every implementation slice must preserve the full existing deterministic test suite and add targeted M15 assertions.

At minimum, final M15 acceptance requires:

- zero-warning lint;
- production build;
- full deterministic tests on Ubuntu and Windows under the repository-pinned Node/npm runtime;
- secret scan;
- production dependency audit at the existing threshold;
- HTML validation;
- serious/critical axe gate;
- explicit design-token contrast assertions;
- 360 px responsive contract or stricter successor;
- no inline executable scripts;
- no server private-key/Hive-broadcast implementation;
- no unauthorized new RPC or write method;
- screenshot/manual visual review for the agreed viewport matrix.

A visual redesign is not accepted if it passes screenshots but weakens authorization, truthfulness, accessibility, or failure handling.

## 22. Acceptance boundaries for M15.0/M15.1

M15.0/M15.1 is accepted when the owner approves this specification as the design source of truth.

Approval authorizes planning for M15.2 but does not by itself authorize:

- production deployment;
- Privex changes;
- source-of-truth integration of later UI implementation;
- Hive writes;
- Keychain requests;
- genuine or synthetic payment;
- payment-window activation;
- Distriator activation;
- new Events, Live, Following Feed, search, recommendations, notifications, or presence semantics.

Until approval, the accepted production and accepted M14.4 source remain authoritative and unchanged.

## 23. M15 design decision summary

The implementation team should be able to answer every proposed UI change with these questions:

1. Is the capability CURRENT, DERIVED, FUTURE, or approved design input?
2. Does the change make 4th Street Bar more prominent than blockchain machinery without hiding safety-critical truth?
3. Does it preserve the accepted route/action/payment semantics?
4. Is an ordinary social user likely to understand the interaction without knowing Hive internals?
5. Does the UI still work at 360 px, by keyboard, with reduced motion, and in signed-out/read-only states?
6. Is amber being used as meaning rather than decoration?
7. Is a card semantically necessary, or would spacing/separators make the social surface calmer?
8. Does the screen show only data the application actually has?

If any answer is unclear, implementation stops at review rather than inventing behavior.
