# Frontend Project Structure

The FormFoundry frontend is organized for clarity, high type safety, and feature-based modularity.

```text
frontend/
├── public/             # Static assets (favicons, etc.)
├── src/                # Main source code
│   ├── assets/         # Images, fonts, and global CSS
│   ├── components/     # UI Component library
│   │   ├── ui/         # Base components (shadcn/ui atoms)
│   │   ├── case/       # Feature: Case workspace sub-components
│   │   │   ├── DetailedWorkspaceView.tsx  # Professional panel-based workspace
│   │   │   ├── SimplifiedChatView.tsx    # Mobile-first conversational guided view
│   │   │   ├── LanguageSelector.tsx      # Premium Globe language switcher dropdown
│   │   │   ├── FieldRow.tsx              # Structured field row with confidence indicators
│   │   │   └── DropdownMenuComponent.tsx # Artifact formats dropdown component
│   │   └── layout/     # Navigation and shell components
│   ├── hooks/          # Shared React hooks (API, SSE, text-to-speech, etc.)
│   ├── locales/        # Translation dictionary JSON files
│   │   ├── en.json     # English translations bundle
│   │   └── hi.json     # Hindi translations bundle
│   ├── lib/            # Utility functions and Axios API client
│   ├── pages/          # Top-level page views (CaseWorkspace, TemplateSelection)
│   ├── types/          # Shared TypeScript interfaces
│   ├── App.tsx         # Main application shell and routing
│   ├── i18n.ts         # i18next bootstrap and persistence configuration
│   ├── index.css       # Global styles and Tailwind variables
│   └── main.tsx        # Application entry point
├── package.json        # Dependencies and scripts
├── vite.config.ts      # Vite configuration
└── tsconfig.json       # TypeScript configuration
```

## Organization Philosophy

1. **Feature Separation**: Components related to a specific feature (like Case Management) are kept together.
2. **Component Granularity**: Monolithic view files are broken down into small, highly cohesive sub-components (such as `DetailedWorkspaceView`, `SimplifiedChatView`, and `LanguageSelector`) to prevent initial load race conditions, improve rendering cycles, and ease testing.
3. **Multi-Locale Architecture**: The UI is decoupled from hardcoded copy by referencing local dictionary JSON maps via standard internationalization engines, maintaining complete UI parity across multiple regional languages.
4. **Type Safety**: Strict TypeScript interfaces are used for all API responses and component props, ensuring a robust development experience with zero `any` parameters.
