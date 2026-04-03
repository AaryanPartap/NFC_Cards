# Deploy Static NFC Profile Site

This project is now static-only and does not require your local server.

## Profile URLs

- Mohit Shrivastava: `/person1`
- Nirmal Arri: `/person2`

After deployment, your NFC links will be:

- `https://your-domain.com/person1`
- `https://your-domain.com/person2`

## Option A: Netlify (recommended)

1. Push this folder to a GitHub repository.
2. Go to Netlify -> Add new site -> Import an existing project.
3. Select your repository.
4. Branch to deploy: `main`.
5. Netlify will read `netlify.toml` automatically (publish directory is already set to `.`).
6. Deploy.
7. Add your custom domain (optional) in Site settings -> Domain management.

## Option B: Vercel

1. Push this folder to GitHub.
2. Go to Vercel -> Add New -> Project.
3. Import the repository.
4. Framework preset: Other.
5. Build command: leave empty.
6. Output directory: leave empty.
7. Deploy.

## NFC Writing

Write these URLs to the cards:

- Card 1: `https://your-domain.com/person1`
- Card 2: `https://your-domain.com/person2`
