# App Review / Google Play App Access — draft

Status: NOT READY TO SUBMIT. Replace every `{{...}}` and remove non-applicable sections after verifying the release build. These instructions describe the intended release, not verified behavior of the current mobile app.

## Build and purpose

App: Yakolak / ياكلك
Version and build: {{VERSION_AND_BUILD}}
Source commit: {{SOURCE_SHA}}
Contact: {{REAL_REVIEW_CONTACT}}

Yakolak is a turn-based board game with three winning patterns: three sizes of one color in a single cell; three equal-size pieces of one color along a line; or three sizes of one color in ascending or descending order along a line. A line can be horizontal, vertical, or diagonal.

The game interface is in {{VERIFIED_UI_LANGUAGES}}. An English store description does not imply an English interface. The screenshots show this build.

## Packaging — select one verified statement

- Bundled web game: the game engine, assets, rules, and interface are included in the app. Offline play does not load the public website. Native integrations in this build are {{ACTUAL_INTEGRATIONS}}.
- Native Godot game: gameplay and the interface run through the exported Godot application. {{ACTUAL_NETWORK_ADAPTER_IF_PRESENT}}.

Do not call a bundled web export a native Godot renderer. Do not describe an incomplete export as a release.

## Single-device review

Authentication: {{ACTUAL_AUTH_REQUIREMENTS_OR_NONE}}
Network requirements: {{OFFLINE_MODES_AND_ANY_ONLINE_REQUIREMENTS}}

1. Launch the app and complete/skip only the introduction options actually available in this build.
2. Select {{ACTUAL_LOCAL_ENTRY_LABEL}}. Use the guest-name flow described in {{EXACT_STEPS}}.
3. Choose a color, confirm, select two players, and set the second player to {{ACTUAL_BOT_LABEL}}.
4. Start a match and choose {{ACTUAL_ROUND_CHOICE}}.
5. Select one of your remaining pieces, then a legal slot on the board. The game indicates whose turn it is.
6. Open {{ACTUAL_HELP_LABEL_AND_LOCATION}} to view the three win patterns. Use {{ACTUAL_SETTINGS_PATH}} for sound, privacy, support, licenses, and local data controls.

Verify these labels and paths before submission. Do not promise a skip button, account-free access, or settings page until implemented and tested.

## Online review — include only if this build offers online play

This build supports {{VERIFIED_PLAYER_COUNTS_AND_MIXED_MODES}}. It uses {{ACTUAL_TRANSPORT_AND_PROVIDERS}}.

1. On device A, create a new room and configure an online seat.
2. On device B, choose Join Room and enter the freshly generated code or open its invitation link.
3. Confirm the available color, then start and exchange moves.
4. Review reconnect behavior through {{VERIFIED_RECONNECT_STEPS}}.

The room is hosted by {{ACTUAL_HOST_MODEL}}. If the host leaves or its process is terminated, {{ACTUAL_OUTCOME}}. A room code is an invitation convenience, not a password. There is no persistent pre-created review room. A single-device offline match is available as described above, but does not replace review of advertised online functionality.

Free-form names / reporting / blocking: {{ACTUAL_SAFETY_DESIGN}}
Review video: {{REAL_ATTACHMENT_REFERENCE}}

## Data and business model

Account system: {{ACTUAL_LOCAL_PROFILE_OR_PERSISTENT_ACCOUNT}}
Data and retention: {{SUMMARY_MATCHING_DECLARATIONS}}
Privacy policy: {{PUBLIC_HTTPS_PRIVACY_URL}}
Support: {{PUBLIC_HTTPS_SUPPORT_URL}}
Ads and purchases: {{ACTUAL_STATUS}}
Export compliance: {{ACTUAL_DECLARATION_IF_REQUESTED}}

There are no reviewer-specific feature switches or hidden unlocks in this release. Use this statement only after auditing the binary and all remote behavior.
