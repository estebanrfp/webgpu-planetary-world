# Authentication & Avatar Customization

This document outlines the implementation of the decentralized authentication system and the Ready Player Me avatar integration.

## 🔑 Authentication (GenosDB)

The project uses [GenosDB](https://github.com/estebanrfp/gdb) for decentralized user identity and data persistence.

### Core Components
- **GenosDBManager**: Handles P2P networking and state management for the database.
- **AuthManager**: A facade that provides a high-level API for:
    - User registration (Identity generation)
    - WebAuthn (Passkey) protection
    - 12-word Mnemonic recovery
    - Session state management
- **AuthUI**: A minimalist dark-glassmorphism overlay that gates world access until the user is authenticated.

### Flow
1. **New User**: Generates a new identity, receives a mnemonic phrase, and can optionally protect the account with WebAuthn.
2. **Returning User**: Logs in via WebAuthn (fast path) or enters their mnemonic phrase.
3. **Session**: The authenticated state is handled by the `ProfileUI` in the top-right corner.

## 👤 Avatar Customization (Ready Player Me)

Integrated [Ready Player Me](https://readyplayer.me/) for high-quality, customizable 3D avatars.

### Features
- **In-App Editor**: Custom iframe implementation that opens the RPM editor within the application.
- **Hot-Swapping**: The `CharacterSystem` supports dynamic reloading of GLB models. When a new avatar is exported, the engine:
    1. Pauses rendering.
    2. Clears previous GPU buffers and textures.
    3. Loads the new GLB.
    4. Recreates necessary BindGroups and resumes rendering.
- **Automatic Thumbnails**: The UI automatically extracts the Avatar ID from the GLB URL and fetches headshot PNGs from the RPM API for use in the profile badge and panel.

### Persistence
The custom avatar URL is saved to `localStorage` under the key `readyplayerme-avatar`, ensuring the user's choice persists across sessions.

## 🛠️ Infrastructure

### Network Module (`lib/network/`)
- `GenosDBManager.js`: Singleton instance of GenosDB.
- `AuthManager.js`: Facade for `db.sm` (Security Manager).
- `RPMManager.js`: Controller for the iframe integration.

### UI Module (`lib/ui/`)
- `AuthUI.js`: Logic for the login/register screens.
- `ProfileUI.js`: Management of the user profile badge and avatar thumbnails.

### Rendering Support
- `CharacterSystem.js`: Updated to handle asynchronous hot-swapping of models.
- `PlanetRenderer`: Updated to reactively update BindGroups when the avatar texture changes.
