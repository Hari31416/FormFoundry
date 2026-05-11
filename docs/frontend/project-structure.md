# Frontend Project Structure

The FormFoundry frontend is organized for clarity and feature-based modularity.

```text
frontend/
├── public/             # Static assets (favicons, etc.)
├── src/                # Main source code
│   ├── assets/         # Images, fonts, and global CSS
│   ├── components/     # UI Component library
│   │   ├── ui/         # Base components (shadcn/ui)
│   │   ├── case/       # Feature: Case workspace components
│   │   └── layout/     # Navigation and shell components
│   ├── hooks/          # Shared React hooks (API, SSE, etc.)
│   ├── lib/            # Utility functions and API client
│   ├── pages/          # Top-level page views
│   ├── types/          # Shared TypeScript interfaces
│   ├── App.tsx         # Main application shell and routing
│   ├── index.css       # Global styles and Tailwind variables
│   └── main.tsx        # Application entry point
├── package.json        # Dependencies and scripts
├── vite.config.ts      # Vite configuration
└── tsconfig.json       # TypeScript configuration
```

## Organization Philosophy

1. **Feature Separation**: Components related to a specific feature (like Case Management) are kept together.
2. **Component Granularity**: Large components like `CaseWorkspace` are broken down into smaller, manageable sub-components (e.g., `EvidencePanel`, `ChatContainer`).
3. **Type Safety**: TypeScript interfaces are used for all API responses and component props, ensuring a robust development experience.
