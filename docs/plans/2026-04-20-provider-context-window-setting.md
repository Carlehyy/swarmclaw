# Provider Context Window Setting 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在新增/编辑 provider 时支持设置上下文窗口大小，不填写则默认 8192，使 `getContextWindowSize` 的第二级 fallback 能读取用户配置。

**Architecture:** 在 `ProviderConfig` 类型中新增 `contextWindowSize` 可选字段；API/校验层透传该字段；UI 层新增数字输入框；`getContextWindowSize` 在 provider 默认值一级优先查用户配置，查不到再查硬编码表。

**Tech Stack:** TypeScript, Zod, Next.js API Routes, React + Tailwind, SQLite (provider_configs collection)

---

## File Structure

| 操作 | 文件路径 | 职责 |
|---|---|---|
| Modify | `src/types/provider.ts` | ProviderConfig 类型新增 contextWindowSize |
| Modify | `src/lib/validation/schemas.ts` | ProviderUpdateSchema 新增 contextWindowSize 校验 |
| Modify | `src/app/api/providers/route.ts` | POST 创建时保存 contextWindowSize |
| Modify | `src/app/api/providers/[id]/route.ts` | PUT 更新时保存 contextWindowSize |
| Modify | `src/lib/server/context-manager.ts` | getContextWindowSize 第二级查用户配置 |
| Modify | `src/components/providers/provider-sheet.tsx` | UI 新增上下文窗口大小输入框 |
| Modify | `src/features/providers/queries.ts` | SaveBuiltinProviderInput 和 saveBuiltin 请求新增 contextWindowSize |
| Modify | `src/lib/server/context-manager.test.ts` | 新增 contextWindowSize 用户配置覆盖的测试 |

---

### Task 1: 类型层 — ProviderConfig 新增 contextWindowSize

**Files:**
- Modify: `src/types/provider.ts` — `ProviderConfig` 接口

- [ ] **Step 1: 在 ProviderConfig 接口中新增可选字段**

在 `ProviderConfig` 接口中添加 `contextWindowSize` 字段：

```ts
export interface ProviderConfig {
  id: string
  name: string
  type: 'builtin' | 'custom'
  baseUrl?: string
  models: string[]
  requiresApiKey: boolean
  credentialId?: string | null
  isEnabled: boolean
  /** User-configured context window size in tokens. Falls back to hardcoded default if not set. */
  contextWindowSize?: number | null
  createdAt: number
  updatedAt: number
}
```

- [ ] **Step 2: 验证类型编译通过**

Run: `cd /root/.swarmclaw/workspace/swarmclaw && npx tsc --noEmit src/types/provider.ts 2>&1 | head -20`
Expected: 无新增错误（可能已有的错误忽略）

- [ ] **Step 3: Commit**

```bash
git add src/types/provider.ts
git commit -m "feat: add contextWindowSize field to ProviderConfig type"
```

---

### Task 2: 校验层 — ProviderUpdateSchema 新增 contextWindowSize

**Files:**
- Modify: `src/lib/validation/schemas.ts` — `ProviderUpdateSchema`

- [ ] **Step 1: 在 ProviderUpdateSchema 中新增 contextWindowSize**

在 `ProviderUpdateSchema` 的 `z.object` 中添加字段：

```ts
// 在 notes 字段之后添加：
contextWindowSize: z.number().int().positive().nullable().optional(),
```

- [ ] **Step 2: 验证编译通过**

Run: `cd /root/.swarmclaw/workspace/swarmclaw && npx tsc --noEmit src/lib/validation/schemas.ts 2>&1 | head -20`
Expected: 无新增错误

- [ ] **Step 3: Commit**

```bash
git add src/lib/validation/schemas.ts
git commit -m "feat: add contextWindowSize validation to ProviderUpdateSchema"
```

---

### Task 3: API 层 — POST 创建 provider 保存 contextWindowSize

**Files:**
- Modify: `src/app/api/providers/route.ts` — POST handler

- [ ] **Step 1: 在 POST handler 的 safeParseBody 泛型和对象构造中添加 contextWindowSize**

将 POST handler 的 safeParseBody 泛型扩展：

```ts
const { data: body, error } = await safeParseBody<{ id?: string; name?: string; baseUrl?: string; models?: string[]; requiresApiKey?: boolean; credentialId?: string | null; isEnabled?: boolean; contextWindowSize?: number | null }>(req)
```

在构造 configs[id] 对象时添加字段：

```ts
configs[id] = {
  id,
  name: body.name || 'Custom Provider',
  type: 'custom',
  baseUrl: body.baseUrl || '',
  models: body.models || [],
  requiresApiKey: body.requiresApiKey ?? true,
  credentialId: body.credentialId || null,
  isEnabled: body.isEnabled ?? true,
  contextWindowSize: body.contextWindowSize ?? null,
  createdAt: Date.now(),
  updatedAt: Date.now(),
}
```

- [ ] **Step 2: 验证编译通过**

Run: `cd /root/.swarmclaw/workspace/swarmclaw && npx tsc --noEmit src/app/api/providers/route.ts 2>&1 | head -20`
Expected: 无新增错误

- [ ] **Step 3: Commit**

```bash
git add src/app/api/providers/route.ts
git commit -m "feat: persist contextWindowSize in POST /providers"
```

---

### Task 4: API 层 — PUT 更新 provider 保存 contextWindowSize

**Files:**
- Modify: `src/app/api/providers/[id]/route.ts` — PUT handler

- [ ] **Step 1: 在 builtin 首次 PUT 创建配置时包含 contextWindowSize**

首次为 builtin provider 创建 config 对象时，不需要特别加 contextWindowSize——它不在 payload 里，由 `...body` 展开自动带入。确认 `ProviderUpdateSchema` 已包含该字段即可。

对于 custom provider 的 PUT，`mutateItem` 里 `...body` 展开已自动包含新增字段，无需额外改动。

验证：确认 `ProviderUpdateSchema` 的 `contextWindowSize` 字段会被 `body` 变量包含进来（已在 Task 2 添加）。

- [ ] **Step 2: 不需要额外代码改动，确认已有逻辑能透传**

现有逻辑：
```ts
// builtin 首次创建时
configs[id] = {
  ...body,     // ← contextWindowSize 已在 body 中
  id,
  name: builtin.name,
  ...
}

// custom/builtin 更新时
mutateItem(ops, id, (existing) => ({
  ...existing,
  ...body,     // ← contextWindowSize 已在 body 中
  id,
  ...
}))
```

`ProviderUpdateSchema` 已有 `contextWindowSize` 时，`body` 中会包含该字段，`...body` 展开会自动写入。无需改动此文件。

- [ ] **Step 3: Commit**

本 Task 无代码改动，跳过 commit。

---

### Task 5: 核心逻辑 — getContextWindowSize 读取用户配置

**Files:**
- Modify: `src/lib/server/context-manager.ts` — `getContextWindowSize` 函数

- [ ] **Step 1: 新增 getProviderContextWindowSizeFromConfig 辅助函数**

在 `PROVIDER_DEFAULT_WINDOWS` 之后、`getContextWindowSize` 之前，添加：

```ts
import { loadProviderConfigs } from './storage'

/**
 * Look up user-configured context window size for a provider.
 * Returns undefined if not configured (caller falls back to hardcoded defaults).
 */
function getProviderContextWindowSizeOverride(provider: string): number | undefined {
  try {
    const configs = loadProviderConfigs()
    const config = configs[provider]
    if (config && typeof config.contextWindowSize === 'number' && config.contextWindowSize > 0) {
      return config.contextWindowSize
    }
  } catch {
    // Storage may not be available in build/bootstrap mode — fall through to defaults
  }
  return undefined
}
```

- [ ] **Step 2: 修改 getContextWindowSize 查用户配置**

将 `getContextWindowSize` 的 fallback 链改为四级：

```ts
/** Get context window size for a model, falling back to provider default */
export function getContextWindowSize(provider: string, model: string): number {
  return PROVIDER_CONTEXT_WINDOWS[model]
    || getProviderContextWindowSizeOverride(provider)
    || PROVIDER_DEFAULT_WINDOWS[provider]
    || 8_192
}
```

优先级：model 精确匹配 → 用户配置的 provider 窗口 → 硬编码 provider 默认值 → 8192

- [ ] **Step 3: 验证编译通过**

Run: `cd /root/.swarmclaw/workspace/swarmclaw && npx tsc --noEmit src/lib/server/context-manager.ts 2>&1 | head -20`
Expected: 无新增错误

- [ ] **Step 4: Commit**

```bash
git add src/lib/server/context-manager.ts
git commit -m "feat: getContextWindowSize reads user-configured provider contextWindowSize"
```

---

### Task 6: 测试 — contextWindowSize 用户配置覆盖

**Files:**
- Modify: `src/lib/server/context-manager.test.ts`

- [ ] **Step 1: 在 getContextWindowSize 测试组中新增用户配置覆盖测试**

在 `describe('getContextWindowSize', ...)` 块中添加新测试：

```ts
it('picks up user-configured contextWindowSize for a provider', () => {
  // Write a provider config with custom contextWindowSize
  const { loadProviderConfigs, saveProviderConfigs } = await import('@/lib/server/storage')
  const configs = loadProviderConfigs()
  configs['test-custom-provider'] = {
    id: 'test-custom-provider',
    name: 'Test Custom Provider',
    type: 'custom',
    baseUrl: 'http://localhost:1234',
    models: [],
    requiresApiKey: false,
    isEnabled: true,
    contextWindowSize: 65_536,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  saveProviderConfigs(configs)

  // Unknown model + provider with user config → should return 65536
  assert.equal(cm.getContextWindowSize('test-custom-provider', 'unknown-model'), 65_536)

  // Cleanup
  delete configs['test-custom-provider']
  saveProviderConfigs(configs)
})

it('user-configured contextWindowSize is overridden by exact model match', () => {
  const { loadProviderConfigs, saveProviderConfigs } = await import('@/lib/server/storage')
  const configs = loadProviderConfigs()
  configs['anthropic'] = {
    ...configs['anthropic'],
    id: 'anthropic',
    name: 'Anthropic',
    type: 'builtin',
    baseUrl: '',
    models: [],
    requiresApiKey: true,
    isEnabled: true,
    contextWindowSize: 50_000,  // User set a smaller value
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  saveProviderConfigs(configs)

  // Exact model match (200k) should win over user config (50k)
  assert.equal(cm.getContextWindowSize('anthropic', 'claude-opus-4-6'), 200_000)

  // But unknown model uses user config
  assert.equal(cm.getContextWindowSize('anthropic', 'claude-unknown-model'), 50_000)

  // Cleanup
  delete configs['anthropic']
  saveProviderConfigs(configs)
})
```

注意：由于 node:test 使用 `it` 回调中的 `await import`，需要在 `describe` 回调支持异步，或把 `import` 提到 `before` 钩子中。根据已有测试模式（`before` 中已有 `import`），建议将 storage import 放到 `before` 中。

实际实现时调整为：

```ts
// 在 before() 中增加：
let storage: typeof import('@/lib/server/storage')
// 在 before() 的异步体中增加：
storage = await import('@/lib/server/storage')

// 测试用例：
it('picks up user-configured contextWindowSize for a provider', () => {
  const configs = storage.loadProviderConfigs()
  configs['test-custom-provider'] = {
    id: 'test-custom-provider',
    name: 'Test Custom Provider',
    type: 'custom',
    baseUrl: 'http://localhost:1234',
    models: [],
    requiresApiKey: false,
    isEnabled: true,
    contextWindowSize: 65_536,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  storage.saveProviderConfigs(configs)

  assert.equal(cm.getContextWindowSize('test-custom-provider', 'unknown-model'), 65_536)

  delete configs['test-custom-provider']
  storage.saveProviderConfigs(configs)
})

it('user-configured contextWindowSize is overridden by exact model match', () => {
  const configs = storage.loadProviderConfigs()
  const originalConfig = configs['anthropic']
  configs['anthropic'] = {
    id: 'anthropic',
    name: 'Anthropic',
    type: 'builtin',
    baseUrl: '',
    models: [],
    requiresApiKey: true,
    isEnabled: true,
    contextWindowSize: 50_000,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  storage.saveProviderConfigs(configs)

  assert.equal(cm.getContextWindowSize('anthropic', 'claude-opus-4-6'), 200_000)
  assert.equal(cm.getContextWindowSize('anthropic', 'claude-unknown-model'), 50_000)

  if (originalConfig) {
    configs['anthropic'] = originalConfig
  } else {
    delete configs['anthropic']
  }
  storage.saveProviderConfigs(configs)
})
```

- [ ] **Step 2: 跑测试验证**

Run: `cd /root/.swarmclaw/workspace/swarmclaw && npx vitest run src/lib/server/context-manager.test.ts 2>&1 | tail -30`
Expected: 所有测试通过

- [ ] **Step 3: Commit**

```bash
git add src/lib/server/context-manager.test.ts
git commit -m "test: add tests for user-configured contextWindowSize override"
```

---

### Task 7: UI 层 — Provider Sheet 新增上下文窗口大小输入框

**Files:**
- Modify: `src/components/providers/provider-sheet.tsx`
- Modify: `src/features/providers/queries.ts`

- [ ] **Step 1: 在 provider-sheet.tsx 中添加 contextWindowSize state**

在现有 state 声明区域（约第 45 行附近）添加：

```ts
const [contextWindowSize, setContextWindowSize] = useState<string>('')
```

- [ ] **Step 2: 在 useEffect 初始化中赋值**

在 `if (editingCustom)` 分支中添加：
```ts
setContextWindowSize(editingCustom.contextWindowSize?.toString() || '')
```

在 `else if (editingBuiltin)` 分支中添加：
```ts
setContextWindowSize(editingBuiltinOverride?.contextWindowSize?.toString() || '')
```

在 `else` 分支中添加：
```ts
setContextWindowSize('')
```

- [ ] **Step 3: 在 handleSave 中传递 contextWindowSize**

在 builtin 保存的 `saveBuiltinProviderMutation.mutateAsync` 调用中添加：
```ts
await saveBuiltinProviderMutation.mutateAsync({
  id: editingId || '',
  models: modelList,
  isEnabled,
  baseUrl: baseUrl.trim() || undefined,
  contextWindowSize: contextWindowSize.trim() ? Number(contextWindowSize) : null,
})
```

在 custom 保存的 data 对象中添加：
```ts
const data = {
  name: name.trim() || 'Custom Provider',
  baseUrl: baseUrl.trim(),
  models: modelList,
  requiresApiKey,
  credentialId,
  isEnabled,
  contextWindowSize: contextWindowSize.trim() ? Number(contextWindowSize) : null,
}
```

- [ ] **Step 4: 在 queries.ts 的 SaveBuiltinProviderInput 接口中添加 contextWindowSize**

```ts
interface SaveBuiltinProviderInput {
  id: string
  models: string[]
  isEnabled: boolean
  baseUrl?: string
  contextWindowSize?: number | null
}
```

在 `useSaveBuiltinProviderMutation` 的 mutationFn 中，将 contextWindowSize 传入 PUT 请求：

```ts
mutationFn: async ({ id, models, isEnabled, baseUrl, contextWindowSize }: SaveBuiltinProviderInput) => {
  await api('PUT', `/providers/${id}/models`, { models })
  return api('PUT', `/providers/${id}`, {
    type: 'builtin',
    isEnabled,
    ...(baseUrl ? { baseUrl } : {}),
    ...(contextWindowSize != null ? { contextWindowSize } : {}),
  })
},
```

- [ ] **Step 5: 在 provider-sheet.tsx 的 JSX 中添加输入框**

在 baseUrl 输入框之后、models 输入区域之前，添加上下文窗口大小输入框：

```tsx
{/* Context Window Size */}
<div className="space-y-1.5">
  <label className="block text-[13px] font-500 text-text-2">
    Context Window Size <span className="text-text-3">(tokens, default: 8192)</span>
  </label>
  <input
    type="number"
    inputMode="numeric"
    placeholder="e.g. 128000"
    value={contextWindowSize}
    onChange={(e) => setContextWindowSize(e.target.value)}
    className="w-full px-4 py-3 rounded-xl border border-white/[0.08] bg-surface-2 text-text-1 text-[15px] outline-none focus:border-accent-bright/40 transition-colors"
    style={{ fontFamily: 'inherit' }}
    min={1}
  />
  <p className="text-[12px] text-text-3 leading-relaxed">
    Maximum context window in tokens. Leave empty to use the provider's default ({editingBuiltin ? PROVIDER_DEFAULT_WINDOWS[editingId!]?.toLocaleString() || '8,192' : '8,192'}). Model-level settings take priority over this value.
  </p>
</div>
```

注意：要在组件顶部 import `PROVIDER_DEFAULT_WINDOWS`：

```ts
import { PROVIDER_DEFAULT_WINDOWS } from '@/lib/server/context-manager'
```

但由于这是客户端组件 (`'use client'`)，不能直接 import server 模块。替代方案：不显示硬编码默认值，改为只显示 "8,192" 作为 fallback 提示文字：

```tsx
<p className="text-[12px] text-text-3 leading-relaxed">
  Maximum context window in tokens. Leave empty to use the default (8,192).
</p>
```

- [ ] **Step 6: 验证编译通过**

Run: `cd /root/.swarmclaw/workspace/swarmclaw && npx tsc --noEmit 2>&1 | head -30`
Expected: 无新增错误

- [ ] **Step 7: Commit**

```bash
git add src/components/providers/provider-sheet.tsx src/features/providers/queries.ts
git commit -m "feat: add context window size input to provider sheet UI"
```

---

### Task 8: 端到端验证

- [ ] **Step 1: 跑全量测试**

Run: `cd /root/.swarmclaw/workspace/swarmclaw && npx vitest run 2>&1 | tail -40`
Expected: 所有测试通过

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `cd /root/.swarmclaw/workspace/swarmclaw && npx tsc --noEmit 2>&1 | tail -20`
Expected: 无新增错误

- [ ] **Step 3: Commit（如有修复）**

如有新增修复：
```bash
git add -A
git commit -m "fix: resolve issues found during e2e verification"
```
