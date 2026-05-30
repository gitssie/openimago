import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises, DOMWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHashHistory } from 'vue-router'
import { h, defineComponent, type Component } from 'vue'
import { QLayout, QPageContainer } from 'quasar'
import ProjectsPage from '../../pages/ProjectsPage.vue'
import routes from '../../router/routes'

const mockListProjects = vi.fn()
const mockCreateProject = vi.fn()

vi.mock('../../api/client', () => ({
  api: {
    listProjects: (...args: unknown[]) => mockListProjects(...args),
    createProject: (...args: unknown[]) => mockCreateProject(...args),
  },
}))

// Stub OiIcon to avoid SVG v-html issues in happy-dom
const StubOiIcon = defineComponent({
  props: { name: String, size: [String, Number] },
  template: '<span class="oi-icon-stub">{{ name }}</span>',
})

interface TestProject {
  id: string
  name: string
  description?: string
  directory: string
  status: 'active' | 'archived'
  createdAt: string
  updatedAt: string
}

function makeProject(overrides?: Partial<TestProject>): TestProject {
  return {
    id: `proj_${crypto.randomUUID().slice(0, 8)}`,
    name: '测试项目',
    description: '测试描述',
    directory: '/mnt/cos/test-project',
    status: 'active',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    ...overrides,
  }
}

function mountPage(component: Component, opts?: Parameters<typeof mount>[1]) {
  const Wrapper = defineComponent({
    components: { QLayout, QPageContainer },
    setup() {
      return () => h(QLayout, { view: 'hHh Lpr fFf' }, () =>
        h(QPageContainer, () => h(component)),
      )
    },
  })
  return mount(Wrapper, {
    global: {
      stubs: {
        OiIcon: StubOiIcon,
        RouterView: { template: '<div class="router-view-stub" />' },
      },
      ...opts?.global,
    },
  })
}

function makeRouter() {
  return createRouter({ history: createWebHashHistory(), routes })
}

describe('ProjectsPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  // ── Mount & Load ───────────────────────────────────────────────────────────

  it('calls store.fetchAll → api.listProjects on mount', async () => {
    mockListProjects.mockResolvedValue([])

    mountPage(ProjectsPage, { global: { plugins: [makeRouter()] } })
    await flushPromises()

    expect(mockListProjects).toHaveBeenCalledOnce()
  })

  it('renders project cards from API response', async () => {
    mockListProjects.mockResolvedValue([
      makeProject({ id: 'proj_a', name: '项目 A', description: '描述 A', directory: '/a' }),
      makeProject({ id: 'proj_b', name: '项目 B', description: '描述 B', directory: '/b' }),
    ])

    const wrapper = mountPage(ProjectsPage, { global: { plugins: [makeRouter()] } })
    await flushPromises()

    expect(wrapper.text()).toContain('项目 A')
    expect(wrapper.text()).toContain('描述 A')
    expect(wrapper.text()).toContain('项目 B')
    expect(wrapper.text()).toContain('描述 B')
  })

  // ── Loading state ─────────────────────────────────────────────────────────

  it('shows loading spinner while listProjects is pending', async () => {
    mockListProjects.mockReturnValue(new Promise(() => {}))

    const wrapper = mountPage(ProjectsPage, { global: { plugins: [makeRouter()] } })
    // Wait for onMounted to fire
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.projects-loading').exists()).toBe(true)
  })

  it('hides loading spinner once projects load', async () => {
    mockListProjects.mockResolvedValue([makeProject()])

    const wrapper = mountPage(ProjectsPage, { global: { plugins: [makeRouter()] } })
    await flushPromises()

    expect(wrapper.find('.projects-loading').exists()).toBe(false)
  })

  // ── Empty state ───────────────────────────────────────────────────────────

  it('shows empty state when no projects are returned', async () => {
    mockListProjects.mockResolvedValue([])

    const wrapper = mountPage(ProjectsPage, { global: { plugins: [makeRouter()] } })
    await flushPromises()

    expect(wrapper.text()).toContain('还没有项目')
    expect(wrapper.text()).toContain('创建第一个吧')
  })

  it('hides empty state when projects exist', async () => {
    mockListProjects.mockResolvedValue([makeProject()])

    const wrapper = mountPage(ProjectsPage, { global: { plugins: [makeRouter()] } })
    await flushPromises()

    expect(wrapper.text()).not.toContain('还没有项目')
  })

  // ── Search ────────────────────────────────────────────────────────────────

  it('filters projects by name search', async () => {
    mockListProjects.mockResolvedValue([
      makeProject({ id: 'proj_1', name: '前端项目', description: 'Vue app' }),
      makeProject({ id: 'proj_2', name: '后端服务', description: 'Go API' }),
    ])

    const wrapper = mountPage(ProjectsPage, { global: { plugins: [makeRouter()] } })
    await flushPromises()

    // Type search query — use the native input element inside QInput
    const nativeInput = wrapper.find('.projects-search').find('input')
    await nativeInput.setValue('后端')

    // Should only show matching project
    expect(wrapper.text()).toContain('后端服务')
    expect(wrapper.text()).not.toContain('前端项目')
  })

  it('shows no-results state for unmatched search', async () => {
    mockListProjects.mockResolvedValue([
      makeProject({ id: 'proj_1', name: '前端项目' }),
    ])

    const wrapper = mountPage(ProjectsPage, { global: { plugins: [makeRouter()] } })
    await flushPromises()

    const nativeInput = wrapper.find('.projects-search').find('input')
    await nativeInput.setValue('不存在')

    expect(wrapper.text()).toContain('没有找到匹配的项目')
  })

  it('clearing search restores all projects', async () => {
    mockListProjects.mockResolvedValue([
      makeProject({ id: 'p1', name: '项目一' }),
      makeProject({ id: 'p2', name: '项目二' }),
    ])

    const wrapper = mountPage(ProjectsPage, { global: { plugins: [makeRouter()] } })
    await flushPromises()

    const nativeInput = wrapper.find('.projects-search').find('input')
    await nativeInput.setValue('一')
    expect(wrapper.text()).toContain('项目一')
    expect(wrapper.text()).not.toContain('项目二')

    await nativeInput.setValue('')
    expect(wrapper.text()).toContain('项目一')
    expect(wrapper.text()).toContain('项目二')
  })

  // ── Navigation ────────────────────────────────────────────────────────────

  it('clicking a project card navigates to /projects/:id', async () => {
    mockListProjects.mockResolvedValue([makeProject({ id: 'proj_nav', name: '导航项目' })])
    const router = makeRouter()
    await router.push('/projects')
    await router.isReady()

    const pushSpy = vi.spyOn(router, 'push')

    const wrapper = mountPage(ProjectsPage, { global: { plugins: [router] } })
    await flushPromises()

    await wrapper.find('.project-card').trigger('click')

    expect(pushSpy).toHaveBeenCalledWith('/projects/proj_nav')
  })

  // ── Create dialog ─────────────────────────────────────────────────────────

  it('clicking 新建项目 opens the create dialog', async () => {
    mockListProjects.mockResolvedValue([])

    const wrapper = mountPage(ProjectsPage, { global: { plugins: [makeRouter()] } })
    await flushPromises()

    await wrapper.find('.create-btn').trigger('click')
    await wrapper.vm.$nextTick()

    // QDialog teleports content to body
    expect(document.querySelector('.project-dialog')).not.toBeNull()
  })

  it('handleCreate with empty name does not call api.createProject', async () => {
    mockListProjects.mockResolvedValue([])

    const wrapper = mountPage(ProjectsPage, { global: { plugins: [makeRouter()] } })
    await flushPromises()

    // Open dialog
    await wrapper.find('.create-btn').trigger('click')
    await wrapper.vm.$nextTick()

    const dialogEl = document.querySelector('.project-dialog')
    expect(dialogEl).not.toBeNull()

    // Click 创建 without filling name
    const buttons = dialogEl!.querySelectorAll('button')
    const createBtn = Array.from(buttons).find(b => b.textContent?.includes('创建'))
    if (createBtn) {
      const btnWrapper = new DOMWrapper(createBtn)
      await btnWrapper.trigger('click')
    }
    await flushPromises()

    expect(mockCreateProject).not.toHaveBeenCalled()
  })

  it('store.create calls api.createProject with name and description', async () => {
    // Quasar's QDialog teleports QInput outside the Vue component tree,
    // making v-model testing with vue-test-utils infeasible.  We verify
    // the create data flow at the store layer instead.
    mockListProjects.mockResolvedValue([])
    const created = makeProject({ id: 'proj_new', name: '新项目' })
    mockCreateProject.mockResolvedValue(created)

    // Mount the page so Pinia context is active, then test store.create directly
    mountPage(ProjectsPage, { global: { plugins: [makeRouter()] } })
    await flushPromises()

    const storeModule = await import('../../stores/projects')
    const store = storeModule.useProjectsStore()
    const result = await store.create({ name: '新项目', description: '测试' })

    expect(mockCreateProject).toHaveBeenCalledWith({ name: '新项目', description: '测试' })
    expect(result.id).toBe('proj_new')
    // Created project is unshifted into the list
    expect(store.projects[0]?.id).toBe('proj_new')
  })
})
