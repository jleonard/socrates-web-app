# Socrates web app POC

The frameowrk for this POC is [remix](https://remix.run/docs). It is **not** a production ready project :( , so far it's just been used to quickly test with the n8n project.

`yarn dev` will run the project.

`http://localhost:5173/app` is where you can run the demo. Note, the port may change.

## Getting started

`app/routes/app` - is the main view where you interact with the elevenlabs agent
`app/

> Below is the original Remix readme. Other than adding the app folder this is a vanilla Remix project

---

# Welcome to Remix!

- 📖 [Remix docs](https://remix.run/docs)

## Development

Run the dev server:

```shellscript
npm run dev
```

## Deployment

First, build your app for production:

```sh
npm run build
```

Then run the app in production mode:

```sh
npm start
```

Now you'll need to pick a host to deploy it to.

### DIY

If you're familiar with deploying Node applications, the built-in Remix app server is production-ready.

Make sure to deploy the output of `npm run build`

- `build/server`
- `build/client`

## Styling

This template comes with [Tailwind CSS](https://tailwindcss.com/) already configured for a simple default starting experience. You can use whatever css framework you prefer. See the [Vite docs on css](https://vitejs.dev/guide/features.html#css) for more information.
