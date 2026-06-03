<template>
  <div class="agent-question-dock imago-dock">
    <!-- Header: "1 of N questions" + progress dots -->
    <div class="question-header row items-center no-wrap q-px-sm q-pt-xs">
      <span class="text-caption text-grey-6 col">{{ t('agentQuestion.questionCount', { current: tabIndex + 1, total }) }}</span>
      <div class="row q-gutter-xs">
        <button
          v-for="(_, i) in questions"
          :key="i"
          class="imago-dot-progress"
          :class="{ 'imago-dot-progress--active': i === tabIndex, 'imago-dot-progress--completed': isAnswered(i) }"
          :disabled="sending"
          @click="jump(i)"
        />
      </div>
    </div>

    <div class="imago-dock__sep" />

    <!-- Question body -->
    <div class="question-body q-px-sm q-py-xs">
      <div class="text-body2 text-weight-medium q-mb-xs">{{ currentQuestion.question }}</div>
      <div class="text-caption text-grey-6 q-mb-sm">
        {{ currentQuestion.multiple ? t('agentQuestion.selectAll') : t('agentQuestion.selectOne') }}
      </div>

      <!-- Options list -->
      <div class="options-list">
        <button
          v-for="(opt, i) in currentQuestion.options"
          :key="i"
          class="imago-option"
          :class="{ 'imago-option--picked': isOptionPicked(opt.label) }"
          :disabled="sending"
          @click="selectOption(opt.label)"
        >
          <span class="option-check">
            <q-icon
              v-if="currentQuestion.multiple"
              :name="isOptionPicked(opt.label) ? 'check_box' : 'check_box_outline_blank'"
              size="18px"
              :color="isOptionPicked(opt.label) ? 'primary' : 'grey-5'"
            />
            <q-icon
              v-else
              :name="isOptionPicked(opt.label) ? 'radio_button_checked' : 'radio_button_unchecked'"
              size="18px"
              :color="isOptionPicked(opt.label) ? 'primary' : 'grey-5'"
            />
          </span>
          <span class="option-main">
            <span class="option-label">{{ opt.label }}</span>
            <span v-if="opt.description" class="option-description text-caption text-grey-5">{{ opt.description }}</span>
          </span>
        </button>

        <!-- Custom "type your own" option (shown when custom !== false) -->
        <template v-if="currentQuestion.custom !== false">
          <button
            v-if="!editingCustom"
            class="imago-option imago-option--custom"
            :class="{ 'imago-option--picked': customOn }"
            :disabled="sending"
            @click="openCustom"
          >
            <span class="option-check">
              <q-icon
                v-if="currentQuestion.multiple"
                :name="customOn ? 'check_box' : 'check_box_outline_blank'"
                size="18px"
                :color="customOn ? 'primary' : 'grey-5'"
              />
              <q-icon
                v-else
                :name="customOn ? 'radio_button_checked' : 'radio_button_unchecked'"
                size="18px"
                :color="customOn ? 'primary' : 'grey-5'"
              />
            </span>
            <span class="option-main">
              <span class="option-label">{{ t('agentQuestion.typeOwnAnswer') }}</span>
              <span class="option-description text-caption text-grey-5">{{ customText || t('agentQuestion.enterCustomAnswer') }}</span>
            </span>
          </button>

          <div v-else class="imago-option imago-option--custom imago-option--picked imago-option--editing">
            <span class="option-check">
              <q-icon
                v-if="currentQuestion.multiple"
                name="check_box"
                size="18px"
                color="primary"
              />
              <q-icon
                v-else
                name="radio_button_checked"
                size="18px"
                color="primary"
              />
            </span>
            <span class="option-main">
              <span class="option-label">{{ t('agentQuestion.typeOwnAnswer') }}</span>
              <q-input
                v-model="customText"
                autofocus dense borderless
                :placeholder="t('agentQuestion.enterCustomAnswer')"
                class="custom-input"
                @keydown.enter.prevent="commitCustom"
                @keydown.esc.prevent="editingCustom = false"
                @blur="commitCustom"
              />
            </span>
          </div>
        </template>
      </div>
    </div>

    <div class="imago-dock__sep" />

    <!-- Footer actions -->
    <div class="question-footer row items-center justify-between q-px-sm q-py-xs">
      <q-btn
        flat no-caps dense
        color="grey-6"
        :label="t('agentQuestion.dismiss')"
        :disable="sending"
        @click="rejectAll"
      />

      <div class="row q-gutter-xs items-center">
        <q-btn
          v-if="tabIndex > 0"
          flat no-caps dense
          color="grey-7"
          :label="t('agentQuestion.back')"
          :disable="sending"
          @click="back"
        />
        <q-btn
          no-caps unelevated
          :color="isLast ? 'primary' : 'grey-8'"
          :text-color="isLast ? 'white' : 'grey-3'"
           :label="isLast ? t('agentQuestion.submit') : t('agentQuestion.next')"
          :loading="sending"
          :disable="sending"
          @click="next"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { QuestionRequest, QuestionAnswer } from '@opencode-ai/sdk/v2';

const props = defineProps<{
  request: QuestionRequest;
  onReply: (requestID: string, answers: QuestionAnswer[]) => Promise<void>;
  onReject: (requestID: string) => Promise<void>;
}>();
const { t } = useI18n();

// ── State ──────────────────────────────────────────────────────────────────────

const tabIndex = ref(0);
const answers = ref<QuestionAnswer[]>([]);
const customTexts = ref<string[]>([]);
const customOns = ref<boolean[]>([]);
const editingCustom = ref(false);
const sending = ref(false);

// ── Computed ──────────────────────────────────────────────────────────────────

const questions = computed(() => props.request.questions);
const total = computed(() => questions.value.length);
const currentQuestion = computed(() => questions.value[tabIndex.value]!);
const isLast = computed(() => tabIndex.value >= total.value - 1);

const customText = computed({
  get: () => customTexts.value[tabIndex.value] ?? '',
  set: (v) => { customTexts.value[tabIndex.value] = v; },
});

const customOn = computed(() => customOns.value[tabIndex.value] === true);

const currentAnswers = computed(() => answers.value[tabIndex.value] ?? []);

// ── Helpers ───────────────────────────────────────────────────────────────────

function isOptionPicked(label: string): boolean {
  return currentAnswers.value.includes(label);
}

function isAnswered(i: number): boolean {
  return (answers.value[i]?.length ?? 0) > 0 ||
    (customOns.value[i] === true && (customTexts.value[i] ?? '').trim().length > 0);
}

function setAnswer(i: number, val: QuestionAnswer) {
  const next = [...answers.value];
  next[i] = val;
  answers.value = next;
}

function selectOption(label: string) {
  if (sending.value) return;
  const q = currentQuestion.value;
  const curr = currentAnswers.value;
  if (q.multiple) {
    const next = curr.includes(label) ? curr.filter((a: string) => a !== label) : [...curr, label];
    setAnswer(tabIndex.value, next);
  } else {
    setAnswer(tabIndex.value, [label]);
    // Clear custom if a preset option is chosen
    customOns.value[tabIndex.value] = false;
    editingCustom.value = false;
  }
}

function openCustom() {
  if (sending.value) return;
  editingCustom.value = true;
  customOns.value[tabIndex.value] = true;
  syncCustomToAnswers();
}

function syncCustomToAnswers() {
  const text = (customTexts.value[tabIndex.value] ?? '').trim();
  const q = currentQuestion.value;
  const curr = currentAnswers.value;
  if (q.multiple) {
    const withoutOld = curr.filter((a: string) => !a.startsWith('__custom__'));
    setAnswer(tabIndex.value, text ? [...withoutOld, text] : withoutOld);
  } else {
    setAnswer(tabIndex.value, text ? [text] : []);
  }
}

function commitCustom() {
  editingCustom.value = false;
  syncCustomToAnswers();
}

function jump(i: number) {
  if (sending.value) return;
  if (editingCustom.value) commitCustom();
  tabIndex.value = i;
  editingCustom.value = false;
}

function back() {
  if (sending.value) return;
  if (editingCustom.value) commitCustom();
  if (tabIndex.value > 0) {
    tabIndex.value--;
    editingCustom.value = false;
  }
}

function next() {
  if (sending.value) return;
  if (editingCustom.value) commitCustom();
  if (!isLast.value) {
    tabIndex.value++;
    editingCustom.value = false;
    return;
  }
  submit();
}

function submit() {
  const finalAnswers = questions.value.map((_q: QuestionRequest['questions'][number], i: number) => answers.value[i] ?? []);
  void doReply(finalAnswers);
}

async function doReply(finalAnswers: QuestionAnswer[]) {
  sending.value = true;
  try {
    await props.onReply(props.request.id, finalAnswers);
  } finally {
    sending.value = false;
  }
}

async function rejectAll() {
  sending.value = true;
  try {
    await props.onReject(props.request.id);
  } finally {
    sending.value = false;
  }
}
</script>

<style lang="scss" scoped>
.agent-question-dock {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  width: calc(100% - 32px);
  max-width: 480px;
  margin-bottom: 12px;
  background: var(--imago-bg-panel);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 1px rgba(255, 255, 255, 0.1);
}

.question-header {
  min-height: 28px;
}

.question-body {
  max-height: 220px;
  overflow-y: auto;
  color: var(--imago-text-primary);
}

.options-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.imago-option--editing {
  cursor: default;
}

.option-check {
  flex-shrink: 0;
  margin-top: 1px;
}

.option-main {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  flex: 1;
}

.option-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--imago-text-primary);
  line-height: 1.3;
}

.option-description {
  font-size: 11px;
  line-height: 1.3;
  color: var(--imago-text-faint);
}

.custom-input {
  width: 100%;
  margin-top: 2px;

  :deep(.q-field__native) {
    color: var(--imago-text-primary);
    caret-color: $primary;
  }

  :deep(.q-field__native::placeholder) {
    color: rgba(255, 255, 255, 0.25);
  }
}

.question-footer {
  min-height: 36px;
}
</style>
