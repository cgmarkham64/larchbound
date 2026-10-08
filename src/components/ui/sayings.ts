export interface Saying {
  text: string
  tag: string
}

export const SAYINGS: Saying[] = [
  // ── Whimsical outdoor ────────────────────────────────────────────────────
  {
    text: 'Not all who wander are lost — but they should still have a map just in case.',
    tag: 'words to wander by',
  },
  {
    text: 'The best view comes after the hardest climb. Every single time.',
    tag: 'words to wander by',
  },
  {
    text: 'Hiking: the art of putting one foot in front of the other until your problems feel very small.',
    tag: 'words to wander by',
  },
  {
    text: 'In every walk with nature, one receives far more than one seeks.',
    tag: 'words to wander by',
  },
  {
    text: "The trail doesn't care how slow you go, only that you keep going.",
    tag: 'words to wander by',
  },
  {
    text: 'Half your water should still be full when you reach the halfway point. The mountains will test you.',
    tag: 'words to wander by',
  },
  {
    text: 'A pack too light means you forgot something. A pack too heavy means you forgot to choose.',
    tag: 'words to wander by',
  },
  {
    text: "The wilderness is not a place to conquer — it's a place to listen.",
    tag: 'words to wander by',
  },
  {
    text: 'Bluebird days are earned, not scheduled.',
    tag: 'words to wander by',
  },
  {
    text: 'Going uphill is temporary. The view is forever.',
    tag: 'words to wander by',
  },

  // ── Leave No Trace ───────────────────────────────────────────────────────
  {
    text: 'Pack it in, pack it out. Everything you carry in belongs on your back on the way home.',
    tag: 'leave no trace',
  },
  {
    text: 'Stay on trail — one step off can crush plants that took decades to grow.',
    tag: 'leave no trace',
  },
  {
    text: 'Bury human waste in a cathole 6–8 inches deep, at least 200 feet from water, trails, and camp.',
    tag: 'leave no trace',
  },
  {
    text: 'Leave wildflowers for the next hiker. A picked flower wilts in hours; a photographed one lasts forever.',
    tag: 'leave no trace',
  },
  {
    text: 'Camp on durable surfaces — rock, gravel, dry grass, or established tent pads. Never break new ground.',
    tag: 'leave no trace',
  },
  {
    text: 'Observe wildlife from a distance. Feeding animals trades their survival for your moment of connection.',
    tag: 'leave no trace',
  },
  {
    text: "Use existing fire rings, keep fires small, and never build one in a place that doesn't already have one.",
    tag: 'leave no trace',
  },
  {
    text: 'Even biodegradable soap pollutes water. Wash dishes and yourself at least 200 feet from any source.',
    tag: 'leave no trace',
  },
  {
    text: 'Take only photographs, leave only footprints — and even then, keep those footprints on the trail.',
    tag: 'leave no trace',
  },

  // ── Safety & first aid ───────────────────────────────────────────────────
  {
    text: 'Blisters forming? Stop now. Drain it carefully and cover with moleskin. Walking it off just makes it worse.',
    tag: 'trail safety',
  },
  {
    text: 'Rule of threes: 3 minutes without air, 3 hours in harsh weather, 3 days without water, 3 weeks without food.',
    tag: 'trail safety',
  },
  {
    text: "Always tell someone your trailhead, your route, and exactly when to call for help if you haven't returned.",
    tag: 'trail safety',
  },
  {
    text: "Drink before you're thirsty. By the time thirst hits, you're already behind on hydration.",
    tag: 'trail safety',
  },
  {
    text: 'When in doubt about a water source, treat it. Giardia takes weeks to show up and ruins every trip it touches.',
    tag: 'trail safety',
  },
  {
    text: "Lightning rule: if you can hear thunder, you're close enough to be struck. Descend and spread your group out.",
    tag: 'trail safety',
  },
  {
    text: 'Altitude headache? Descend 1,000 feet. Never sleep higher than you feel.',
    tag: 'trail safety',
  },
  {
    text: "If you're lost: Stop. Think. Observe. Plan. The worst thing you can do is keep moving without knowing why.",
    tag: 'trail safety',
  },
  {
    text: 'Turn back before you feel like you have to. The summit will still be there next season.',
    tag: 'trail safety',
  },
  {
    text: 'A map and compass you know how to use is worth ten fully-charged phones in the backcountry.',
    tag: 'trail safety',
  },
]

export function randomSaying(): Saying {
  return SAYINGS[Math.floor(Math.random() * SAYINGS.length)]
}

export const PERMIT_LOOKUP_SAYINGS: Saying[] = [
  {
    text: 'LarchBound is reading every sign on the trail — even the ones half-covered in lichen.',
    tag: 'looking for the needle in the haystack',
  },
  {
    text: 'Bushwhacking through bureaucracy, one regulation at a time.',
    tag: 'looking for the needle in the haystack',
  },
  {
    text: 'Cross-referencing trailheads, ranger districts, and probably a few overgrown bulletin boards.',
    tag: 'looking for the needle in the haystack',
  },
  {
    text: 'LarchBound found the ranger station. Now checking if they have WiFi.',
    tag: 'looking for the needle in the haystack',
  },
  {
    text: 'Navigating the permit wilderness so you can focus on the actual wilderness.',
    tag: 'looking for the needle in the haystack',
  },
  {
    text: "There's no permit for curiosity — but LarchBound looked it up just to be sure.",
    tag: 'looking for the needle in the haystack',
  },
  {
    text: 'Following the paper trail deeper into the backcountry of federal bureaucracy.',
    tag: 'looking for the needle in the haystack',
  },
]

export function randomPermitSaying(): Saying {
  return PERMIT_LOOKUP_SAYINGS[Math.floor(Math.random() * PERMIT_LOOKUP_SAYINGS.length)]
}
