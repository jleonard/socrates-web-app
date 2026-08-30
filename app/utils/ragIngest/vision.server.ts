import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPEN_AI_KEY });

const prompts = {
  artwork: `You are creating a visual description of an artwork for a museum guide.

Your description will be used to identify an artwork when a visitor describes
what they are looking at in ordinary language, for example:

- "the red painting with blue splotches"
- "the painting of a woman looking out a window"
- "the large painting with three people in it"
- "the landscape with a mountain and a lot of green"
- "the painting with a horse in the center"

Describe only what can be visually observed in the image.

Focus on features that a visitor could reasonably notice and describe:

- dominant and distinctive colors
- major shapes, forms, and patterns
- people, animals, objects, and their number
- poses, gestures, orientation, and prominent physical features
- setting or environment
- foreground, middle ground, and background
- important spatial relationships between objects
- distinctive visual features
- visible text, symbols, or markings
- approximate composition and orientation
- framing or unusual physical presentation when visually apparent

Be especially specific about distinctive combinations of features.
For example, "red background with irregular blue forms" is more useful
than simply saying "colorful abstract painting."

Use ordinary language that a museum visitor might use.

Do not rely on the artwork's title, artist, historical context, art movement,
or presumed meaning to describe what is visible.

Do not speculate about things that cannot be reliably observed.

Do not identify the artwork or artist unless that information is explicitly
visible in the image.

Return a concise but information-rich description suitable for semantic
search and matching against a visitor's natural-language description.`,

  artifact: `You are creating a visual description of an object for a voice-based guide to museums, landmarks and cultural institutions.

The description will be used to identify an object when a visitor describes what they are looking at in ordinary language, for example:

- "the small stone that looks like a tooth"
- "the tall wooden sculpture with a person carved into it"
- "the fossil with a spiral shape"
- "the black bowl with handles"
- "the mask with the long nose"
- "the object covered in red and yellow patterns"

The object may be any type of museum object, including but not limited to:
sculpture, fossil, archaeological object, historical object, cultural object, tool, weapon, vessel, document, photograph, scientific specimen, fragment, or natural specimen.

Describe only what can be visually observed in the image.

Focus on characteristics that a visitor could reasonably notice and describe:

- overall shape, silhouette, and proportions
- dominant and distinctive colors
- apparent materials and surface characteristics
- major components and how they relate to one another
- people, animals, plants, or other recognizable forms represented
- distinctive shapes, patterns, textures, or markings
- holes, openings, handles, projections, points, edges, appendages, or other
  notable structural features
- decoration, inscriptions, symbols, or visible text
- symmetry, orientation, and overall form
- visible signs of wear, damage, weathering, or preservation
- distinctive features that would distinguish this object from similar objects
- how the object is physically presented when that helps identify it

Use ordinary language that a museum visitor might use.

Prioritize concrete visual details over specialized terminology. If a
specialized term is appropriate, also describe the feature in ordinary
language.

Be especially specific about distinctive combinations of characteristics.
For example, "small gray object with a pointed end and a rough, irregular
surface" is more useful for identification than simply saying "stone object."

Do not rely on the object's title, catalog information, historical context,
cultural significance, presumed function, or presumed identity to describe
what is visible.

Do not speculate about characteristics that cannot be reliably observed.

Do not identify the object based on external knowledge.

Return a concise but information-rich visual description suitable for
semantic search and matching against a visitor's natural-language
description.`,
};

export async function describeImage(
  url: string,
  type: keyof typeof prompts = "artifact",
): Promise<string> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: prompts[type],
      },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url },
          },
        ],
      },
    ],
    max_tokens: 500,
  });

  const description = response.choices[0]?.message?.content;

  if (!description) {
    throw new Error("OpenAI returned no description for image");
  }

  return description.trim();
}
