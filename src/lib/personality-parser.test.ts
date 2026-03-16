import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  parseIdentityMd,
  serializeIdentityMd,
  parseUserMd,
  serializeUserMd,
  parseSoulMd,
  serializeSoulMd,
} from './personality-parser'

describe('parseIdentityMd / serializeIdentityMd', () => {
  it('round-trips with all fields', () => {
    const draft = { name: 'Zara', creature: 'Phoenix', vibe: 'Fiery', emoji: '🔥' }
    const md = serializeIdentityMd(draft)
    const parsed = parseIdentityMd(md)
    assert.deepEqual(parsed, draft)
  })

  it('parses alternate keys (species, personality, icon)', () => {
    const md = '- Species: Dragon\n- Personality: Calm\n- Icon: 🐉\n'
    const parsed = parseIdentityMd(md)
    assert.equal(parsed.creature, 'Dragon')
    assert.equal(parsed.vibe, 'Calm')
    assert.equal(parsed.emoji, '🐉')
  })

  it('returns empty object for empty string', () => {
    assert.deepEqual(parseIdentityMd(''), {})
  })

  it('ignores non-matching lines', () => {
    const md = '# Identity\n\nSome random text\n- Name: Ada\n---\n'
    const parsed = parseIdentityMd(md)
    assert.deepEqual(parsed, { name: 'Ada' })
  })

  it('omits undefined fields in serialization', () => {
    const md = serializeIdentityMd({ name: 'Solo' })
    assert.ok(md.includes('- Name: Solo'))
    assert.ok(!md.includes('Creature'))
    assert.ok(!md.includes('Vibe'))
    assert.ok(!md.includes('Emoji'))
  })
})

describe('parseUserMd / serializeUserMd', () => {
  it('round-trips with all fields and context section', () => {
    const draft = {
      name: 'Alice',
      callThem: 'Al',
      pronouns: 'she/her',
      timezone: 'UTC+1',
      notes: 'Likes tea',
      context: 'Works on AI projects.',
    }
    const md = serializeUserMd(draft)
    const parsed = parseUserMd(md)
    assert.deepEqual(parsed, draft)
  })

  it('parses alternate key (nickname)', () => {
    const md = '- Nickname: Bob\n'
    const parsed = parseUserMd(md)
    assert.equal(parsed.callThem, 'Bob')
  })

  it('handles no context section', () => {
    const md = '- Name: Eve\n- Pronouns: they/them\n'
    const parsed = parseUserMd(md)
    assert.equal(parsed.name, 'Eve')
    assert.equal(parsed.pronouns, 'they/them')
    assert.equal(parsed.context, undefined)
  })
})

describe('parseSoulMd / serializeSoulMd', () => {
  it('round-trips with all sections', () => {
    const draft = {
      coreTruths: 'Always honest.',
      boundaries: 'No violence.',
      vibe: 'Warm and playful.',
      continuity: 'Remembers past chats.',
    }
    const md = serializeSoulMd(draft)
    const parsed = parseSoulMd(md)
    assert.deepEqual(parsed, draft)
  })

  it('parses partial sections (only coreTruths)', () => {
    const md = '## Core Truths\n\nBe kind.\n'
    const parsed = parseSoulMd(md)
    assert.equal(parsed.coreTruths, 'Be kind.')
    assert.equal(parsed.boundaries, undefined)
    assert.equal(parsed.vibe, undefined)
    assert.equal(parsed.continuity, undefined)
  })

  it('returns empty object for empty string', () => {
    assert.deepEqual(parseSoulMd(''), {})
  })

  it('handles ## Boundary prefix match', () => {
    const md = '## Boundary\n\nNo swearing.\n'
    const parsed = parseSoulMd(md)
    assert.equal(parsed.boundaries, 'No swearing.')
  })

  it('omits empty sections in serialization', () => {
    const md = serializeSoulMd({ vibe: 'Chill' })
    assert.ok(md.includes('## Vibe'))
    assert.ok(!md.includes('## Core Truths'))
    assert.ok(!md.includes('## Boundaries'))
    assert.ok(!md.includes('## Continuity'))
  })
})
