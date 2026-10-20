'use strict';
const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');
const { StringDecoder } = require('node:string_decoder');
const { ProviderError } = require('./runtime');

class JsonRpc extends EventEmitter {
  constructor(binary, args, options) {
    super();
    this.pending = new Map();
    this.nextId = 1;
    this.buffer = '';
    this.closed = false;
    this.decoder = new StringDecoder('utf8');
    this.child = spawn(binary, args, { ...options, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    this.child.stdout.on('data', chunk => this.parse(this.decoder.write(chunk)));
    // Never forward diagnostics that can contain account data or prompts to the renderer.
    this.child.stderr.on('data', () => {});
    this.child.stdin.on('error', () => {});
    this.child.on('error', error => this.fail(new ProviderError(error.message, 'CLIENT_ERROR')));
    this.child.on('close', () => this.fail(new ProviderError('Codex stopped. Please retry the request.', 'CLIENT_EXIT')));
  }
  send(message) {
    if (this.closed) throw new ProviderError('Codex is not connected.', 'CLIENT_EXIT');
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }
  request(method, params = {}, timeout = 30000) {
    if (this.closed) return Promise.reject(new ProviderError('Codex is not connected.', 'CLIENT_EXIT'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new ProviderError(`Codex timed out during ${method}.`, 'TIMEOUT'));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      try { this.send({ id, method, params }); } catch (error) {
        clearTimeout(timer); this.pending.delete(id); reject(error);
      }
    });
  }
  parse(chunk) {
    this.buffer += chunk;
    if (this.buffer.length > 12 * 1024 * 1024) return this.fail(new ProviderError('Codex sent an oversized message.'));
    let boundary;
    while ((boundary = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, boundary);
      this.buffer = this.buffer.slice(boundary + 1);
      if (!line.trim()) continue;
      let message;
      try { message = JSON.parse(line); } catch {
        this.fail(new ProviderError('Codex sent an invalid protocol message.'));
        return;
      }
      const pending = this.pending.get(message.id);
      if (pending && !message.method) {
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        message.error
          ? pending.reject(new ProviderError(message.error.message, 'CODEX_ERROR'))
          : pending.resolve(message.result);
      } else if (message.method && message.id !== undefined) {
        // The overlay never approves commands, edits, external tools or permission escalation.
        if (message.method.endsWith('/requestApproval')) this.send({ id: message.id, result: { decision: 'decline' } });
        else this.send({ id: message.id, error: { code: -32601, message: 'Tools and interactive requests are disabled in Spectro.' } });
      } else if (message.method) this.emit('notification', message.method, message.params);
    }
  }
  fail(error) {
    if (this.closed) return;
    this.closed = true;
    for (const { reject, timer } of this.pending.values()) { clearTimeout(timer); reject(error); }
    this.pending.clear();
    this.emit('disconnect', error);
    this.child.kill('SIGTERM');
  }
  close() {
    this.fail(new ProviderError('Connection closed.', 'CANCELLED'));
    const timer = setTimeout(() => this.child.kill('SIGKILL'), 1500);
    timer.unref();
  }
}
module.exports = { JsonRpc };
