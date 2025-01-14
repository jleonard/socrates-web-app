# Socrates web app POC

The frameowrk for this POC is [remix](https://remix.run/docs). It is **not** a production ready project :( , so far it's just been used to quickly test with the n8n project.

`yarn dev` will run the project.

`http://localhost:5173/web-stt` is where you can run the demo. Note, the port may change.

## Tech choices

This POC uses the browser's [native speech API](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition). It isn't univerally supported but does work in Chrome.

So far I've found the native speech API has been fast and accurate.

`app/routes/web-stt/web-stt` - this is where the view for the POC is built. The route uses [zustand](https://zustand.docs.pmnd.rs/getting-started/introduction) for state management. All the logic to send text to n8n and handle the response happens here.

`app/routes/web-stt/components/record-button.tsx` - this component is imported into the route above. It manages the native speech API.

`app/routes/web-stt/components/wav-player.tsx` - this component accepts the wav file that comes back from n8n and plays it in the browser.

`app/routes/web-stt/components/voice-bars/tsx` - this is just a presentation component to display audio bars when the player is playing. No important logic in here.

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
