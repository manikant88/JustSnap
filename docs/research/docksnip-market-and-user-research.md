# DockSnip market and user research

**Research date:** 2026-09-14  
**Product premise evaluated:** A free-first, local-first, account-free visual staging tool that lets people capture screen regions or collect webpage images, optionally place images into unnamed flat Folders, drag or copy an image or a whole Folder into another destination, and retain everything until explicit discard.

## Executive conclusion

DockSnip should not choose WhatsApp, Figma, Jira, email, or AI chat as its identity. Those are destinations, and the same person may use several of them in one day. The strongest early-user definition is behavioral:

> **Browser-heavy visual knowledge workers who repeatedly move one or more screenshots or webpage images into another work surface and resent saving, finding, selecting, and cleaning up temporary files.**

This includes designers gathering references, researchers feeding visual evidence to AI or documents, QA/support staff reporting defects, and operators or marketers sending image batches. They share a job-to-be-done—**stage visuals between capture and use**—even though their destinations differ.

The opportunity is not “a better screenshot editor.” Native operating systems already make a single screenshot easy, and mature paid tools compete heavily on annotation, OCR, screen recording, beautification, history, and cloud sharing. DockSnip’s sharper wedge is the missing middle between capture and destination: a persistent, visible, disposable holding surface that supports both individual images and multi-image Folders.

The closest conceptual competitors are therefore not only screenshot products but temporary drag shelves such as Dropover and Yoink. Dropover describes its core as collecting items on “a temporary shelf” and moving everything in one pass; Yoink describes itself as a temporary place for file drags. Their continued development and paid utility models are evidence that staging is a recognized job, while DockSnip’s screenshot-first, browser-native Folder flow is a distinct implementation of it. [Dropover](https://dropoverapp.com/) [Yoink](https://blog.eternalstorms.at/2026/08/03/yoink-for-mac-v3-7-6-improves-compatibility-with-browsers/)

For the first release, keep **capture, collect, deliver, and discard** free and focused. Do not add naming, search, cloud sync, automatic cleanup, delivery-status semantics, or destination-specific product identity. First prove repeat usage and reliable transfer. Editing and artifact composition are plausible later paid adjacencies, but they should be earned through observed demand rather than assumed now.

## Evidence standard and limitations

This report uses primary sources: official product pages, official pricing and help pages, platform documentation, and original vendor research. Prices are current as observed on 2026-09-14, in USD where the source publishes USD, and may exclude tax or vary by region.

There is no independent behavioral dataset here that measures how often people save screenshots temporarily, how often they move multiple screenshots in one task, or how much time DockSnip would save. TechSmith’s research is original but vendor-sponsored and studies visual communication broadly, not DockSnip’s staging workflow. It supports the importance of visuals, but it does not prove product-market fit. All recommendations below labeled **Inference** or **Hypothesis** require validation with DockSnip users.

## What user behavior is already established

### 1. Capture-to-immediate-use is a platform-level workflow

Apple’s own screenshot interface shows a temporary floating thumbnail specifically so a user can drag the new capture into a document, email, note, or Finder window before it is saved. Apple also documents copying a screenshot directly to the clipboard instead of the desktop. [Apple Screenshot documentation](https://support.apple.com/en-nz/guide/mac-help/mh26782/mac)

Windows similarly copies a new snip to the clipboard and documents immediate paste into another application; its Snipping Tool then offers annotation, save, and share actions. [Microsoft Snipping Tool documentation](https://support.microsoft.com/en-US/Windows/Apps/use-snipping-tool-to-capture-screenshots) [Microsoft 365 screenshot documentation](https://support.microsoft.com/en-us/office/copy-the-window-or-screen-contents)

**Inference:** Immediate use is not an invented behavior that DockSnip must teach. The unresolved friction is that native overlays are short-lived and oriented around one capture, while DockSnip persists multiple captures and lets the user stage them as a batch.

### 2. Screenshots and images travel into many unrelated destinations

Official destination documentation confirms that image/file drag or paste is a normal input across several categories:

- ChatGPT accepts an image through file selection, drag into the composer, or clipboard paste. [OpenAI image input documentation](https://help.openai.com/en/articles/8400551-image-inputs-for-chatgpt-faq%23.doc)
- Figma accepts image uploads in bulk, clipboard paste, and drag-and-drop onto the canvas. [Figma image import documentation](https://help.figma.com/hc/en-us/articles/360040028034-Add-images-and-videos-to-designs)
- Slack allows up to ten files to be dragged into a message field in one operation. [Slack file documentation](https://slack.com/help/articles/201330736-Add-files-to-Slack-Add-files-to-Slack)
- Jira Cloud accepts files dragged directly onto a work item and explains that attachments add context that text cannot provide. [Atlassian attachment documentation](https://support.atlassian.com/jira-software-cloud/docs/add-an-attachment-to-an-issue/)
- Google Docs and Slides accept images dragged from a computer or website, and also accept copied web images. [Google Docs Editors image documentation](https://support.google.com/docs/answer/97447)

**Inference:** Destination breadth is real. Positioning around a single named application would hide the horizontal value. Destination examples should demonstrate variety, while reliability testing should still maintain an internal compatibility matrix.

### 3. Visual communication is common and useful, especially in work

TechSmith and Qualtrics surveyed 969 full-time workers across the US, UK, France, and Germany in 2023. Among those who create screenshots, charts, and similar images to support communication, 97% said images make their messages more effective; respondents attributed reduced misunderstandings (74%), saved time (68%), and increased engagement/attention (64%) to images. The study also reports that 96% either use images at work or would like to try. [TechSmith, *From Chaos to Clarity*](https://assets.techsmith.com/Docs/chaos-to-clarity-workplace-communication.pdf) [Methodology page](https://www.techsmith.com/resources/research/chaos-to-clarity-report/)

An earlier TechSmith experiment tested 125 people on real office tasks. Participants receiving text plus marked-up screenshots or video performed tasks more accurately and faster than those receiving text alone; the report says 67% performed better with visual communication and absorbed the information 7% faster. [TechSmith, *The Value of Visuals*](https://assets.techsmith.com/resources/Value-of-Visuals.pdf)

TechSmith also reports an internal analysis of its support tickets: tickets where agents used Snagit resolved with half as many touches as those without images. This is useful directional evidence for support and QA workflows, but it is a vendor’s own operational analysis and does not establish causation across other companies. [TechSmith customer-service analysis](https://www.techsmith.com/blog/improve-customer-service/)

**Inference:** DockSnip does not need to persuade people that screenshots are useful. Its product claim should be about reducing handling friction around a behavior users already value.

## Best-fit early users

### Recommended segmentation: behavior first, profession second

The initial addressable user should satisfy most of these conditions:

1. Works primarily on a computer and frequently uses a browser.
2. Captures or collects images at least several times per week.
3. Often needs more than one image for the same task.
4. Moves those images into different destinations rather than one fixed integration.
5. Treats source images as working material, not a permanent archive.
6. Notices desktop/Downloads clutter or the capture-save-find-upload loop.
7. Values speed and privacy more than collaboration infrastructure.

This is narrower and more actionable than “everyone who takes screenshots,” but remains destination-independent.

### Early-user cohorts, ordered by likely fit

| Cohort | Representative task | Why the core fits | What must be validated |
|---|---|---|---|
| **Product builders**: designers, developers, QA, product managers | Collect UI references or bug states, then add them to Figma, Jira, an AI chat, or a product document | High screenshot frequency, multiple destinations, visual evidence, multi-image tasks | Whether Folders materially outperform clipboard history and native capture |
| **Researchers and analysts** | Gather charts, passages rendered as images, interface states, and references, then place them into AI chats, Docs, Slides, or reports | Cross-source collection and multi-image synthesis are central | Copyright/privacy concerns; whether users want source traceability, which is currently a non-goal |
| **Support and operations staff** | Capture steps or errors and attach them to tickets, email, chat, or internal docs | Visuals reduce explanation burden; task evidence often consists of several states | Enterprise security constraints and whether annotation becomes essential |
| **Marketers, social operators, and small-business owners** | Collect product images or create screenshots and move a batch into mail, messaging, social, or creative tools | Immediate sharing and batching are frequent | Whether webpage-image collection is legally/operationally acceptable; mobile handoff demand |
| **Students and general personal users** | Save temporary visual references and reuse them in notes, AI chats, documents, or messages | Broad use and easy onboarding | Lower frequency and willingness to pay; likely valuable for distribution more than early revenue |

Shottr explicitly positions itself to designers, front-end engineers, mobile developers, and people who care about pixels; its feature set includes temporary pinned screenshot storage, OCR, combining screenshots, measurement, and annotation. This is direct evidence that product-building roles are a recognized screenshot-tool segment. [Shottr product page](https://www.shottr.cc/)

Snagit positions screenshots and screen recordings across IT/support, marketing, training, technical communication, and leadership rather than one destination. [TechSmith enterprise use cases](https://assets.techsmith.com/Docs/pdf-snagit/Snagit-Visual-Communication-Across-the-Enterprise-EN.pdf)

**Recommendation:** Recruit the first serious test cohort from product builders, researchers, and support/operations people. Describe them publicly with a broad job statement—“for anyone who moves screenshots between apps”—but conduct onboarding and interviews by cohort so distinct needs are visible.

## Core job and domain boundaries

### Primary job-to-be-done

> When I encounter or create visual material that I will need in another place, let me hold one or several images beside my work and deliver them together without creating and managing disposable files.

### Functional stages

1. **Capture or collect:** Take a screen-region capture or collect an existing webpage image.
2. **Stage:** Keep the image visible and available while the user changes tab, context, or destination.
3. **Batch:** Optionally put images into an unnamed, flat Folder; an empty Folder is valid and can later receive images.
4. **Deliver:** Copy/drag an image or all images in a Folder, in their explicit order, to a destination.
5. **Retain:** Delivery copies and never consumes. No “used” or “delivered” state is inferred.
6. **Discard:** A capture remains until explicitly deleted. Deleting a Folder also deletes every capture it contains; deleting its final image leaves the empty Folder intact.

### Product principles

- **Visual clipboard, not library:** no names, tags, search, source catalog, or long-term organizational hierarchy in the first release.
- **Destination-independent:** examples are marketing and testing material, not architectural coupling.
- **Explicit loss only:** no auto-delete after drag, timeout, restart, or guessed upload success.
- **Flat batching:** images can move into Folders; Folders cannot nest or move into other Folders.
- **Local-first:** captures should remain local unless the user deliberately delivers them to another service.
- **No account for the free core:** installation should be enough to reach first value.

## Competitive landscape

### Native capture substitutes

| Product | Official positioning and relevant behavior | Current price | Implication for DockSnip |
|---|---|---:|---|
| macOS Screenshot | Captures screen/window/region; floating thumbnail can be dragged into a document, email, note, or Finder before save | Included with macOS | A single temporary capture is already free; DockSnip must win on persistence, collection, and batch delivery. [Source](https://support.apple.com/en-nz/guide/mac-help/mh26782/mac) |
| Windows Snipping Tool | Captures, copies to clipboard, annotates, OCRs/redacts text locally, saves, and shares | Included with Windows | Basic capture, clipboard, markup, and OCR are commodity capabilities. [Source](https://support.microsoft.com/en-US/Windows/Apps/use-snipping-tool-to-capture-screenshots) |

### Screenshot products

| Product | Official positioning / relevant features | Current price | Strategic signal |
|---|---|---:|---|
| Shottr | Lightweight Mac screenshot tool for designers/developers; annotation, OCR, combine screenshots, pinned temporary storage, drag-out | Free indefinitely with prompts; Basic **$12 once**; Friends Club **$30 once** | Low-cost utility model works; temporary storage exists, but batching-to-arbitrary-destination is not the central product. [Features](https://www.shottr.cc/) [Pricing](https://www.shottr.cc/purchase.html) |
| CleanShot X | Screenshot/recording suite with quick-access overlay, direct drag/drop, annotation, OCR, history, beautification, pinning, cloud | Basic **$35 once**, includes one year of updates; optional renewal **$19/year**. Pro **$10/user/month**, annually | Mature tools monetize enhancement, history, cloud, and teams. “One drag away” is already a competitor claim, so DockSnip must emphasize multi-item staging/Folders. [Features](https://cleanshot.com/screenshots) [Pricing](https://cleanshot.com/pricing) |
| Snagit | Professional screen capture, markup, step guides, searchable library, quick sharing, and recording | Individual **$39/year** | Strong evidence for paid editing/documentation value, but its breadth and subscription/account model leave room for a lighter local utility. [Product](https://www.techsmith.com/snagit/) [Pricing](https://www.techsmith.com/store/snagit) |
| Awesome Screenshot | Browser and desktop capture/recording, annotation, local saves, cloud history, and integrations | Free; Basic **$5/month annually**; Professional **$6/month annually** | Browser capture is crowded and basic local screenshots are free; cloud storage/recording/integrations drive subscriptions. [Product](https://www.awesomescreenshot.com/) [Pricing](https://www.awesomescreenshot.com/pricing) |
| GoFullPage | Browser-native full-page capture with local PNG/PDF export; Premium adds editing, annotation, and smart PDF splitting | **$12/year** with a seven-day trial | A narrow browser capture tool can monetize transformations while leaving its core capture workflow free. [FAQ](https://gofullpage.com/faq) [Premium](https://gofullpage.com/premium) |
| ScreenFloat 2 | Captures float above apps; drag-out sharing; editing, OCR, redaction, formats, Shots Browser, folders, search, iCloud | **$17.99 once** | Very close on persistent visual availability, but evolves into a permanent organized library. DockSnip should preserve the faster disposable mental model. [Product and pricing](https://www.eternalstorms.at/ScreenFloat/) [Drag/export](https://blog.eternalstorms.at/2024/06/14/get-to-know-screenfloat-2-part-v-share-drag-and-drop-link-sharing-export/) |
| Xnapper | Fast beautified Mac screenshots with backgrounds, redaction, OCR, annotation, history, compression | Free with watermark; Basic **$29.99 once** with one year of updates | Visual polish and social-ready formatting support a paid upgrade, but they are an adjacency rather than DockSnip’s core. [Product](https://xnapper.com/) [Pricing](https://xnapper.com/de/pricing) |

### Staging, shelf, and clipboard products

| Product | Official positioning / relevant features | Current price | Strategic signal |
|---|---|---:|---|
| Dropover | Temporary shelf for files, links, text, and images; collect then move/share/process everything at once; actions include resize, OCR, ZIP, and uploads | Full 14-day trial; limited free mode afterward; Pro **$6.99 once** in the US Mac App Store | This is the closest job-level competitor. Its broad file handling validates the shelf metaphor; DockSnip can be faster and more opinionated for captured/collected images. [Product](https://dropoverapp.com/) [Purchase model](https://dropoverapp.com/kb/purchases) [US App Store](https://apps.apple.com/us/app/dropover-easier-drag-drop/id1355679052?mt=12) |
| Yoink | Temporary place for file drags, including images from websites; appears during drag and can hold multiple items | **$8.99 once**, 28-day trial | Users pay modest one-time prices for reduced drag friction. Browser compatibility remains active maintenance work even for a native shelf. [Product/pricing](https://blog.eternalstorms.at/2026/08/03/yoink-for-mac-v3-7-6-improves-compatibility-with-browsers/) |
| Paste | Persistent, searchable, synchronized clipboard history and pinboards across Apple devices | **$2.49/month** or **$29.99/year**; lifetime purchase available but current lifetime amount is not shown in the default page response | Clipboard history solves retrieval and reuse, not purposeful temporary batching. It is adjacent but points toward a permanent library—the direction DockSnip should initially avoid. [Product](https://pasteapp.io/) [Pricing](https://pasteapp.io/pricing) |

### Competitive gap

No reviewed product’s primary promise is exactly:

> **Capture or collect several images, arrange them as a disposable visual batch, and drag the batch into the next place.**

Dropover and Yoink own general temporary staging; CleanShot, Shottr, Snagit, ScreenFloat, and Xnapper own capture plus editing/history. DockSnip’s differentiation is the intersection:

- screenshot and webpage-image native;
- persistent but intentionally disposable;
- visible beside browser work;
- one-image and multi-image delivery;
- unnamed, flat Folders rather than library organization;
- local and account-free.

That gap is a **positioning inference**, not evidence of low competition. Both sides can add the missing features, so speed, reliability, and interaction quality matter more than feature novelty.

## Extension versus native desktop product

### What the extension is good for

- Fast distribution with no separate desktop installer.
- Native proximity to webpage images and browser-region capture.
- A focused test of the staging/Folders concept before funding a native app.

### Structural constraints

Chrome content scripts run only on URL patterns permitted by the manifest and in an isolated execution environment; broad host patterns can produce permission warnings. [Chrome content-script documentation](https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts) [Chrome permission guidance](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions)

**Inference:** A browser extension can test whether the workflow is wanted, but it cannot fully deliver the user’s destination-independent ambition. Restricted browser surfaces, non-browser apps, page-specific drop behavior, and trust-sensitive host permissions create ceilings.

### What a macOS app could unlock

Apple provides ScreenCaptureKit for capturing selected displays, applications, and windows, subject to user permission. AppKit file promises allow an app to provide image files lazily during drag and are explicitly demonstrated across Finder, Mail, Safari, and Photos, including multiple images. [Apple ScreenCaptureKit](https://developer.apple.com/documentation/screencapturekit) [Apple drag/file-promise sample](https://developer.apple.com/documentation/AppKit/supporting-table-view-drag-and-drop-through-file-promises)

**Inference:** A native Mac app can more faithfully implement the product promise: capture outside the browser, stay visible across applications, and expose real native drag items rather than relying on destination-page event behavior. It should be considered after the extension proves retention, not as a substitute for product validation.

### Recommended platform sequence

1. Use the Chrome extension to validate demand, the Folder model, repeat usage, and destination diversity.
2. Instrument only privacy-safe local counters initially; ask users to opt into sharing aggregated usage or research feedback.
3. Build a macOS proof-of-concept only after evidence shows meaningful usage is blocked by browser boundaries.
4. If native succeeds, keep one conceptual model across products: capture/collect → stage → Folder → deliver → discard.

Do not certify only one destination publicly. Maintain a private regression matrix of popular destinations because a horizontal promise still requires compatibility evidence.

## Monetization opportunities

### Confirmed first-release decision

The core—capture, collect, Folder, drag/copy, discard—should be free in the first release. This maximizes learning and avoids charging for a workflow that still needs compatibility and reliability refinement.

### Paid adjacency ranking

| Opportunity | Evidence | Fit with DockSnip | Recommendation |
|---|---|---|---|
| **Focused editing and privacy tools**: crop, resize, annotate, arrows, blur/solid redaction | CleanShot, Snagit, Shottr, ScreenFloat, and Xnapper all foreground editing/annotation/redaction in paid products. [CleanShot](https://cleanshot.com/features) [Snagit](https://www.techsmith.com/snagit/) [Shottr](https://www.shottr.cc/) [ScreenFloat](https://blog.eternalstorms.at/2024/01/17/get-to-know-screenfloat-2-part-v-editing-markup-annotations/) [Xnapper](https://xnapper.com/) | High: transforms a staged image immediately before delivery without requiring a permanent library | **Highest-confidence paid hypothesis**, but begin with only the tasks users repeatedly request. |
| **Folder composition/export**: contact sheet, ordered PDF, ZIP, image strip, lightweight report | Shottr combines screenshots; ScreenFloat exports screenshots as PDF and supports print/export; CleanShot combines images and supports multi-page printing; Dropover offers ZIP and image resize actions. [Shottr](https://www.shottr.cc/) [ScreenFloat export](https://blog.eternalstorms.at/2024/06/14/get-to-know-screenfloat-2-part-v-share-drag-and-drop-link-sharing-export/) [CleanShot features](https://cleanshot.com/features) [Dropover](https://dropoverapp.com/) | High if it is an action on a temporary Folder, low if it becomes a document-management suite | **Strong differentiated hypothesis.** Test “Export Folder as…” before building a report editor. |
| **Formatting/beautification**: backgrounds, padding, shadows, device frames, social ratios | CleanShot and Xnapper sell polished screenshot presentation; Xnapper’s free tier adds a watermark and charges once to remove it. [CleanShot](https://cleanshot.com/screenshots) [Xnapper](https://xnapper.com/) | Medium: valuable to creators and marketers, less so to QA/support/research | Validate by cohort; likely an optional paid toolset, not universal core. |
| **Automation and reusable actions**: presets, keyboard workflows, format conversion | Dropover offers custom actions/scripts; ScreenFloat offers double-click workflows; CleanShot offers presets and a URL-scheme API. [Dropover](https://dropoverapp.com/) [ScreenFloat workflows](https://www.eternalstorms.at/ScreenFloat/) [CleanShot API](https://cleanshot.com/docs-api) | Medium-high for high-frequency professional users | Good later “Pro” value after common repeated transformations are observed. |
| **OCR and text extraction** | Windows Snipping Tool provides local OCR for free; CleanShot, Shottr, ScreenFloat, and Xnapper also offer it. [Microsoft](https://support.microsoft.com/en-US/Windows/Apps/use-snipping-tool-to-capture-screenshots) | Useful but increasingly commoditized | Add only if users need it in-flow; weak as the sole reason to pay. |
| **Scrolling/full-page capture** | CleanShot, Shottr, Snagit, and Awesome Screenshot compete here. | Useful capture expansion but not specific to staging | Consider after core reliability; avoid leading positioning with it. |
| **Cloud links, sync, and teams** | CleanShot Pro charges for unlimited cloud, branding, access controls, SSO/SCIM; Awesome Screenshot subscriptions add cloud capacity and integrations; Paste sells sync and team pinboards. [CleanShot pricing](https://cleanshot.com/pricing) [Awesome Screenshot pricing](https://www.awesomescreenshot.com/pricing) [Paste Teams](https://pasteapp.io/teams) | Conflicts with account-free/local-first simplicity and adds service obligations | Defer until demand is explicit. If built, make it optional and separate from local capture. |
| **Screen recording/video editing** | Snagit, CleanShot, and Awesome Screenshot bundle video/recording into paid plans. | Large market but major scope expansion | Explicit non-goal until DockSnip’s image workflow is stable and research strongly requests it. |

### Pricing inference

One-time prices among focused Mac utilities in this set range from Dropover at $6.99, Yoink at $8.99, and Shottr Basic at $12 to ScreenFloat at $17.99, Xnapper Basic at $29.99, and CleanShot Basic at $35. Subscription products add cloud, collaboration, recording, or broader professional workflows. [Dropover](https://apps.apple.com/us/app/dropover-easier-drag-drop/id1355679052?mt=12) [Yoink](https://blog.eternalstorms.at/2026/08/03/yoink-for-mac-v3-7-6-improves-compatibility-with-browsers/) [Shottr](https://www.shottr.cc/purchase.html) [ScreenFloat](https://www.eternalstorms.at/ScreenFloat/) [Xnapper](https://xnapper.com/de/pricing) [CleanShot](https://cleanshot.com/pricing)

**Hypothesis:** If DockSnip later adds a coherent local editing and Folder-export package, a **$19–35 one-time personal license** with optional paid major upgrades is market-consistent. The free core should remain unmetered; premium tools can receive a generous full-feature trial. Do not finalize price before willingness-to-pay interviews and a live pricing test.

### Revenue sequencing

1. **Release 1 — free learning product:** all core staging and Folder behavior, no account.
2. **Stability gate:** resolve data-loss, capture, drag, and destination compatibility defects; measure retention and repeated Folder use.
3. **Discovery:** interview retained users and expose non-functional “coming later” concepts or a ranked feature survey—without promising delivery.
4. **Premium prototype:** build the smallest high-demand transformation, likely markup/redaction or “Export Folder as PDF/contact sheet.”
5. **Monetization test:** give every user the complete premium workflow temporarily, then test a one-time license rather than usage metering.
6. **Team path only on evidence:** add transferable seats or administration only after multiple users from the same organization ask for it.

## First-release scope recommendation

### Must be excellent

- Region screenshot and webpage-image collection.
- Persistent dock across supported browser tabs and restarts.
- Create empty Folder; add/remove/reorder captures; delete Folder and all contents.
- Drag/copy one capture or a whole Folder in stable order.
- Repeat delivery without consumption or “used” state.
- Explicit capture, Folder, and clear-all deletion with recoverable error handling.
- Privacy explanation and narrowest practical permissions.
- Reliability across a representative matrix: browser chat, email, AI composer, design canvas, document/presentation, and issue tracker.

### Explicitly defer

- Names, tags, search, favorites, source tracking, history as a permanent library.
- Nested Folders or Folder-to-Folder drag.
- Automatic cleanup or expiry.
- Delivery detection, “recently used,” or auto-delete.
- Accounts, cloud sync, shared workspaces, and team controls.
- Editing, OCR, PDF/report generation, scrolling capture, video, and AI processing until the core is validated.

## Validation plan

### Recruitment

Recruit 5–7 participants in each of three behavior-rich groups:

1. Product builders (design/development/QA/product).
2. Research/support/operations knowledge workers.
3. Marketers, creators, or small-business operators.

Screen for at least three screenshot/image-transfer tasks per week and at least two distinct destination categories. Avoid recruiting primarily on enthusiasm for screenshot tools; observed workflow frequency matters more.

### Interview prompts

- “Show me the last time you moved a screenshot or webpage image somewhere else.”
- “Where did the image begin, where did it end, and what happened to the file afterward?”
- “Show me a task where you needed several images.”
- “What do you do while switching between the source and destination?”
- “When has drag, paste, or upload failed, and what did you do next?”
- “Which image changes do you make before sharing? Show the last real example.”
- “When do screenshots become clutter, and when do they become records you need to keep?”
- “What would make you distrust an extension that can capture webpages?”
- After using DockSnip: “What did you expect to happen when dragging a Folder?” and “What would stop you from keeping this installed?”

Ask for demonstrations and recent artifacts rather than feature wish lists. Feature requests should be traced back to a recurring job and current workaround.

### Product signals worth measuring

Keep analytics opt-in and coarse; never collect images, page contents, URLs, destination domains, or clipboard data.

- Activation: first successful capture/collection and first drag/copy.
- Repeat value: active days and successful workflows per week.
- Folder value: share of retained users who create a Folder; median images per Folder; repeat Folder delivery attempts.
- Breadth: self-reported destination category, collected through optional surveys rather than automatic domain logging.
- Reliability: local error codes by operation and user-confirmed “worked / did not work” sampling.
- Retention: week-1 and week-4 return among activated users.
- Monetization evidence: percentage of retained users who repeatedly perform an editing/export workaround outside DockSnip.

Do not use raw capture count as the primary success metric; it can reward accidental usage without proving delivery value.

## Decisions and open hypotheses

### Supported by current product direction

- Keep the user-facing term **Folder**.
- Empty Folders are valid.
- Folders are flat and cannot contain Folders.
- A Folder deletion deletes every contained image.
- Captures persist until explicit discard.
- Delivery is copy semantics and can happen repeatedly.
- No post-delivery cleanup prompt or “recently dragged” UI.
- First release is free and account-free.
- First release does only capture, collect, deliver, and discard.

### Still hypotheses

- Product builders/research/support will retain better than general screenshot users.
- Multi-image Folder drag is the differentiator users notice and repeat.
- A desktop app becomes justified by cross-application demand rather than being premature scope expansion.
- Editing/redaction and Folder-to-PDF/contact-sheet exports will have stronger willingness to pay than OCR or cloud sync.
- A one-time license in the $19–35 range will fit perceived value.

The next research milestone should be behavioral interviews and instrumented beta observation—not additional competitive feature collection. The market already demonstrates abundant capture/edit/share tools; DockSnip now needs evidence that its staging-and-Folder loop becomes habitual.
