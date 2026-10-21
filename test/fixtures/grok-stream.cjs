// Synthetic external client for protocol framing and failure tests.
const scenario = process.argv[2];
const init = { type: 'system', subtype: 'init', apiKeySource: scenario === 'api' ? 'user' : 'oauth', model: 'grok-4.7', tools: scenario === 'tools' ? ['read_file'] : [], mcp_servers: [], skills: [] };
const messages = [init, { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Café 🔴' } } }];
if (scenario !== 'missing') messages.push({ type: 'result', subtype: 'success', is_error: false, result: 'Café 🔴', stop_reason: scenario === 'truncated' ? 'max_tokens' : 'end_turn', session_id: 'session' });
const bytes = Buffer.from(messages.map(value => JSON.stringify(value)).join('\n')); // deliberately no final newline
(async () => { for (const byte of bytes) { process.stdout.write(Buffer.from([byte])); await new Promise(setImmediate); } })();
