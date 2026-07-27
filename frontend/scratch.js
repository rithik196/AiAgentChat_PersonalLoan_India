const { streamText } = require('ai');
const { openai } = require('@ai-sdk/openai');

const result = streamText({
  model: openai('gpt-4o-mini'),
  messages: [{ role: 'user', content: 'hello' }],
});

console.log(Object.keys(result));
