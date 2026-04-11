import assert from 'node:assert/strict'
import test from 'node:test'
import { isOllamaCloudEndpoint, normalizeOllamaCloudEndpoint, normalizeOllamaMode, resolveStoredOllamaMode } from './ollama-mode'

test('normalizeOllamaMode only accepts explicit local and cloud values', () => {
  assert.equal(normalizeOllamaMode('local'), 'local')
  assert.equal(normalizeOllamaMode('cloud'), 'cloud')
  assert.equal(normalizeOllamaMode(''), null)
  assert.equal(normalizeOllamaMode('something-else'), null)
})

test('isOllamaCloudEndpoint recognizes Ollama Cloud URLs', () => {
  assert.equal(isOllamaCloudEndpoint('https://ollama.com'), true)
  assert.equal(isOllamaCloudEndpoint('https://api.ollama.com/v1'), true)
  assert.equal(isOllamaCloudEndpoint('http://localhost:11434'), false)
})

test('resolveStoredOllamaMode prefers explicit mode over endpoint inference', () => {
  assert.equal(resolveStoredOllamaMode({
    ollamaMode: 'local',
    apiEndpoint: 'https://ollama.com',
  }), 'local')
  assert.equal(resolveStoredOllamaMode({
    ollamaMode: 'cloud',
    apiEndpoint: 'http://localhost:11434',
  }), 'cloud')
})

test('resolveStoredOllamaMode falls back to endpoint only for legacy records', () => {
  assert.equal(resolveStoredOllamaMode({ apiEndpoint: 'https://ollama.com' }), 'cloud')
  assert.equal(resolveStoredOllamaMode({ apiEndpoint: 'http://localhost:11434' }), 'local')
  assert.equal(resolveStoredOllamaMode({}), 'local')
})

test('normalizeOllamaCloudEndpoint rewrites api.ollama.com to ollama.com', () => {
  assert.equal(normalizeOllamaCloudEndpoint('https://api.ollama.com'), 'https://ollama.com')
  assert.equal(normalizeOllamaCloudEndpoint('https://api.ollama.com/v1'), 'https://ollama.com/v1')
  assert.equal(normalizeOllamaCloudEndpoint('http://api.ollama.com'), 'http://ollama.com')
  assert.equal(normalizeOllamaCloudEndpoint('https://www.ollama.com'), 'https://ollama.com')
})

test('normalizeOllamaCloudEndpoint preserves correct ollama.com URLs', () => {
  assert.equal(normalizeOllamaCloudEndpoint('https://ollama.com'), 'https://ollama.com')
  assert.equal(normalizeOllamaCloudEndpoint('https://ollama.com/v1'), 'https://ollama.com/v1')
})

test('normalizeOllamaCloudEndpoint does not mangle non-Ollama endpoints', () => {
  assert.equal(normalizeOllamaCloudEndpoint('http://localhost:11434'), 'http://localhost:11434')
  assert.equal(normalizeOllamaCloudEndpoint('https://api.openai.com/v1'), 'https://api.openai.com/v1')
})
