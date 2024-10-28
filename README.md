# 4th Street Bar

A web application that brings the social experience of a neighborhood bar to the Hive blockchain. Built with Express.js, TailwindCSS, and HTMX, this platform enables users to interact, share content, and manage their Hive assets in a familiar bar-themed environment.

## Features

- **User Profiles**
  - View user blog posts and activities
  - Track Hive Power milestones with bar-themed ranks
  - Monitor wallet balances and resource credits
  - Send and receive encrypted messages
  - Wall posts system for public interactions

- **Community Integration**
  - View and interact with community posts
  - Participate in community threads
  - Real-time content updates using HTMX

- **Blockchain Features**
  - Hive blockchain integration via dhive
  - Resource credits monitoring
  - Voting power tracking
  - Secure encrypted messaging
  - Hive Power milestone system

## Prerequisites

- Node.js (v12 or higher)
- npm
- A Hive account for full functionality

## Installation

1. Clone the repository:
```bash
git clone [repository-url]
cd 4th-street-bar
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory with the following variables:
```env
COMMUNITY_NAME=your_community_name
THREADS_CONTAINER_ACCOUNT=your_threads_account
```

4. Build the CSS:
```bash
npm run build:css
```

## Development

Start the development server with hot-reloading:
```bash
npm run dev:all
```

This command will:
- Start the Express server with nodemon
- Watch for CSS changes and rebuild automatically
- Run both processes concurrently

## Available Scripts

- `npm start` - Start the production server
- `npm run dev` - Start the development server with nodemon
- `npm run build:css` - Build the TailwindCSS files
- `npm run watch:css` - Watch and rebuild CSS files
- `npm run dev:all` - Run development server and CSS watcher concurrently

## Project Structure

```
├── data/               # Mock data for development
├── public/            # Static assets
│   ├── css/          # Compiled CSS
│   └── js/           # Client-side JavaScript
├── routes/           # Express route handlers
├── src/              # Source files
│   └── input.css    # TailwindCSS input file
├── utils/            # Utility functions
│   ├── communities/ # Community-related utilities
│   └── profiles/    # Profile-related utilities
└── views/            # EJS templates
    ├── common/      # Shared components
    ├── pages/       # Page templates
    └── partials/    # Reusable partials
```

## Technologies Used

- **Backend**
  - Express.js - Web framework
  - EJS - Templating engine
  - @hiveio/dhive - Hive blockchain integration

- **Frontend**
  - TailwindCSS - Utility-first CSS framework
  - HTMX - Dynamic HTML updates
  - Remarkable - Markdown parsing

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.