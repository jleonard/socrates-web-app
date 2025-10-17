# Socrates web app POC

## Promo Code Logic

Promo codes are used to track sign-ups from events, locations etc. The promo code is built into the query string as `promo`.

**How promo codes are captured**

1. When the user hits the app with a `promo` value in the query string.
2. Then the `root.tsx` file will save it to localstorage so we can wait to process it until we have a `user`
3. After the user logs in and hits `/app` then `useSyncPromo` is called.
4. The hook checks for a promo code in localstorage and preps an `access` record for the user if its there.

## Access Logic

- The `app/` loader will check with `access.manager.server` to determine if the user can access the view.
- The loader passes an `access` property to the front end
- When a conversation starts...
- - If the front end `access` doesn't have an expiration date, then set it by adding the access record's `hours` to the current date.
- When a conversation ends...
- - We check to see if the current date is beyond the `access` expiration. If expired NEED business decision on how to update the UI

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
