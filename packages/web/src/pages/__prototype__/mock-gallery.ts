/* ═══════════════════════════════════════════════════════════════════════════
 * PROTOTYPE — MOCK DATA
 * Throwaway mock for validating Gallery home + viewer UX.
 * ═══════════════════════════════════════════════════════════════════════════ */

export interface GalleryWork {
  slug: string
  title: string
  category: string
  prompt: string
  tags: string[]
}

const RAW: { category: string; title: string; prompt: string; tags: string[] }[] = [
  { category: 'poster', title: '霓虹都市', prompt: 'A cinematic movie poster for a cyberpunk thriller set in a neon-drenched metropolis. Dark alleys, flying cars, and holographic billboards. The protagonist stands alone against the city lights, rain-slicked streets reflecting the glow. Aspect ratio 2:3, film grain, high contrast.', tags: ['科幻', '赛博朋克'] },
  { category: 'poster', title: '深海迷踪', prompt: 'A movie poster for a deep-sea exploration drama. A lone submarine descends into bioluminescent depths where ancient ruins emerge from the darkness. Soft blue-green lighting, god rays piercing the water column. Cinematic composition, 2:3 ratio.', tags: ['海洋', '探险'] },
  { category: 'poster', title: '烈焰狂想曲', prompt: 'Fantasy adventure movie poster. A phoenix rises from volcanic ash against a crimson sky, silhouetting a small group of travelers. Epic scale, dramatic rim lighting, painterly oil style. Golden ratio composition.', tags: ['奇幻', '史诗'] },
  { category: 'poster', title: '时间折痕', prompt: 'Sci-fi thriller poster. A woman stands at the intersection of parallel timelines — one side crumbling Victorian architecture, the other gleaming chrome future. Split composition, warm/cool color divide, minimal typography space at the top.', tags: ['科幻', '悬疑'] },

  { category: 'product', title: '极光耳机', prompt: 'Product photography of premium wireless headphones with aurora borealis LED accents. Floating on a black reflective surface, dramatic studio lighting, macro detail of the ear cup texture. Shot on a 85mm lens, shallow depth of field. E-commerce hero shot style.', tags: ['3C', '科技'] },
  { category: 'product', title: '晨露香水', prompt: 'Luxury perfume bottle on a marble pedestal with morning dew droplets. Soft natural window light from the left, crystal glass refraction catching prismatic highlights. Minimal composition, white and gold color scheme, editorial magazine quality.', tags: ['美妆', '奢侈品'] },
  { category: 'product', title: '幻境跑鞋', prompt: 'Dynamic product shot of futuristic running shoes mid-stride, suspended above a neon grid floor. Motion blur trails in cyan and magenta, particles dispersing from the sole. Athletic lifestyle aesthetic, 3/4 angle, dramatic under-lighting.', tags: ['运动', '潮流'] },
  { category: 'product', title: '暮色腕表', prompt: 'Luxury wristwatch resting on aged leather and dark wood. Warm golden sunset light through a window creates long shadows. Macro lens capturing the intricate watch face details. Vintage elegance, editorial photography style.', tags: ['腕表', '奢侈品'] },

  { category: 'character', title: '流浪剑客', prompt: 'Character concept art of a wandering swordsman in a post-apocalyptic wasteland. Worn leather armor, a mechanical arm, and an oversized blade. Dusty orange atmosphere, character turnaround sheet style showing front and 3/4 views with equipment callouts.', tags: ['概念设计', '末世'] },
  { category: 'character', title: '星空魔女', prompt: 'Anime-style character design of a cosmic witch. Flowing hair that transitions into a starry nebula, a crescent moon staff, layered gothic lolita dress in deep purples and midnight blues. Full-body illustration with magical particle effects.', tags: ['二次元', '魔法'] },
  { category: 'character', title: '铁拳武者', prompt: 'Realistic character portrait of an aging martial arts master. Weathered face with wisdom in the eyes, traditional robes with subtle dragon embroidery. Rembrandt lighting from a single candle, oil painting quality. Half-body composition.', tags: ['写实', '东方'] },
  { category: 'character', title: '花之精灵', prompt: 'Whimsical forest spirit character design. Petal-like translucent wings, a dress made of living vines and blooming flowers, dew-drop jewelry. Soft morning light filtering through canopy leaves. Studio Ghibli inspired art style, full body.', tags: ['奇幻', '治愈'] },

  { category: 'scene', title: '天空之城废墟', prompt: 'Environmental concept art of floating ancient ruins among clouds at golden hour. Massive stone arches overgrown with luminescent vines, waterfalls cascading off the edges into thin air below. Epic scale, matte painting quality.', tags: ['概念设计', '幻想'] },
  { category: 'scene', title: '赛博夜市', prompt: 'Dense cyberpunk street market at night. Layers of neon signs in multiple languages, steam rising from food stalls, holographic advertisements on every surface. Crowded but atmospheric, wet ground reflecting all the lights. Blade Runner aesthetic.', tags: ['赛博朋克', '街景'] },
  { category: 'scene', title: '竹海晨曦', prompt: 'Serene bamboo forest at sunrise with morning mist rolling through. Soft golden light piercing through the tall stalks, a small wooden bridge over a crystal stream. Traditional Chinese ink wash painting aesthetic combined with photorealistic rendering.', tags: ['自然', '东方'] },
  { category: 'scene', title: '极地科考站', prompt: 'Futuristic Antarctic research station during the polar night. Aurora borealis dancing overhead, warm orange glow from the station windows contrasting with the icy blue exterior. Snow-covered solar panels and a landing pad for VTOL aircraft. Sci-fi realism.', tags: ['科幻', '极地'] },

  { category: 'brand', title: '云端咖啡', prompt: 'Complete brand identity for a premium cloud-themed coffee shop. Logo mark: a coffee cup with steam forming a cloud shape. Color palette: warm cream, deep brown, sky blue. Applications: cup sleeve, storefront signage, loyalty card, mobile app icon mockups.', tags: ['餐饮', '现代'] },
  { category: 'brand', title: '绿洲瑜伽', prompt: 'Brand visual system for a holistic yoga and wellness studio. Organic flowing logo inspired by a lotus transitioning into a human silhouette. Earthy color palette: terracotta, sage green, sand. Applications: studio signage, app onboarding screens, merchandise mockups.', tags: ['健康', '自然'] },
  { category: 'brand', title: '脉冲电竞', prompt: 'Esports team brand identity package. Sharp angular logo with electric blue and hot pink gradients. Team jersey mockups, social media templates, arena stage design concept, and animated logo reveal storyboard. Aggressive, futuristic, high-energy.', tags: ['电竞', '科技'] },
  { category: 'brand', title: '花间甜品', prompt: 'Artisan dessert patisserie branding. Delicate line-art logo of a flower blooming from a macaron. Soft pastel color scheme: rose pink, mint green, and gold foil accents. Packaging design, shop window display, Instagram feed template.', tags: ['甜品', '女性'] },

  { category: 'storyboard', title: '月下追逐', prompt: '6-panel storyboard sequence for an action chase scene through a moonlit forest. Panel 1: protagonist spots the pursuers. Panel 2-3: parkour over fallen logs and streams. Panel 4: narrow escape into a cave. Panel 5: reveal of ancient runes inside. Panel 6: cliffhanger closeup.', tags: ['动作', '冒险'] },
  { category: 'storyboard', title: '机器人觉醒', prompt: '8-panel storyboard for a sci-fi short. A factory robot gradually gains sentience. Panels show: monotonous assembly line, noticing a butterfly, first spark of curiosity, teaching itself to paint, confrontation with supervisor, escape through the city at dawn.', tags: ['科幻', '情感'] },
  { category: 'storyboard', title: '毕业典礼', prompt: '4-panel slice-of-life storyboard for an animated short. A student\'s last day: saying goodbye to the empty classroom, walking past the cherry blossom trees, receiving a handmade gift from a friend, tears and laughter at the school gate. Warm, nostalgic color grade.', tags: ['日常', '青春'] },
  { category: 'storyboard', title: '龙之契约', prompt: '5-panel fantasy storyboard. A young knight must forge a pact with a wounded dragon. Panels: discovering the dragon in a cave, initial distrust, sharing food, the bonding moment with glowing runes, flying together into battle against the dark army.', tags: ['奇幻', '史诗'] },
]

const PALETTES: Record<string, string[]> = {
  poster: ['#ff2d55', '#ff6b6b', '#1a1a2e', '#16213e'],
  product: ['#00d2ff', '#3a7bd5', '#0f0c29', '#302b63'],
  character: ['#f7971e', '#ffd200', '#1d1d1d', '#3a3a3a'],
  scene: ['#56ab2f', '#a8e063', '#0f2027', '#203a43'],
  brand: ['#c471ed', '#f64f59', '#141e30', '#243b55'],
  storyboard: ['#fc4a1a', '#f7b733', '#0b0b0b', '#2c2c2c'],
}

export function generateWorks(count = 24): GalleryWork[] {
  const works: GalleryWork[] = []
  // Duplicate and shuffle RAW to get enough items
  const pool = [...RAW]
  while (works.length < count) {
    for (const item of pool) {
      if (works.length >= count) break
      const idx = works.length + 1
      works.push({
        slug: `${item.category}-${String(idx).padStart(2, '0')}`,
        title: `${item.title} #${idx}`,
        category: item.category,
        prompt: item.prompt,
        tags: item.tags,
      })
    }
  }
  return works
}

export function getGradient(category: string, seed: number): string {
  const palette = PALETTES[category] ?? ['#333', '#555', '#111', '#222']
  const angle = (seed * 47 + 137) % 360
  return `linear-gradient(${angle}deg, ${palette[0]}, ${palette[1]} 30%, ${palette[2]} 70%, ${palette[3]})`
}

export const ALL_CATEGORIES = [
  { value: 'all', label: '全部' },
  { value: 'poster', label: '海报' },
  { value: 'product', label: '产品' },
  { value: 'character', label: '角色' },
  { value: 'scene', label: '场景' },
  { value: 'brand', label: '品牌' },
  { value: 'storyboard', label: '分镜' },
]
