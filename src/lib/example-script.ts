export const EXAMPLE_SCRIPT = `# The Letter from Room 9
[scene: dim hotel corridor at night, one door slightly open]
NARRATOR: The letter arrived three days late, which was strange, because it had been posted from the room next to mine.
CLERK: Nobody has stayed in that room in years.

[scene: close-up of an old envelope on a wooden desk, warm lamp light]
NARRATOR: The handwriting was my own. The date on the postmark was tomorrow.

[scene: a hand-drawn floor plan of the hotel, room nine circled in red ink]
NARRATOR: I asked to see the register.
CLERK: Sir, the ninth floor was sealed after the fire.

[scene: a brass key with a paper tag, lying on a dark carpet]
NARRATOR: That night, a key was waiting outside my door.
`;

export const SCRIPT_CHEATSHEET = [
  { code: "# Title", note: "First line: the story title" },
  { code: "[scene: what we see]", note: "Starts a scene; the text is the image prompt" },
  { code: "NARRATOR: text", note: "A spoken line. Any name before the colon is a character" },
  { code: "text without a name", note: "Continues the previous speaker" },
];
