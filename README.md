# Socrates web app POC

## The Promo Code Flow

Promo codes are used to track sign-ups from events, locations etc. The promo code is built into the query string as `promo`.

**How promo codes are captured**

1. Promo codes are captured in the root.tsx file and saved to localstorage.
2. After the user logs in and hits the `/app` the hook `useSyncPromo` is called.
3. The hook checks for a promo code in local storage and sets it on the user's profile if so.

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

---
