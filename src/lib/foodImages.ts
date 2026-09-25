// Product pictures: 3D icons from Microsoft Fluent Emoji (MIT licence), bundled
// in public/food so they work offline. A product without a chosen picture gets
// one suggested from its name.

export interface FoodImage {
  id: string
  label: string
}

export const foodImages: FoodImage[] = [
  { id: 'noodles', label: 'Noodles / Maggi' },
  { id: 'tea', label: 'Tea / Chai' },
  { id: 'coffee', label: 'Coffee' },
  { id: 'soda', label: 'Cold drink' },
  { id: 'juice', label: 'Juice' },
  { id: 'water', label: 'Water' },
  { id: 'milk', label: 'Milk / Lassi' },
  { id: 'bubbletea', label: 'Shake' },
  { id: 'fries', label: 'Chips / Fries' },
  { id: 'popcorn', label: 'Popcorn' },
  { id: 'peanuts', label: 'Peanuts / Namkeen' },
  { id: 'sandwich', label: 'Sandwich' },
  { id: 'burger', label: 'Burger' },
  { id: 'pizza', label: 'Pizza' },
  { id: 'hotdog', label: 'Hot dog' },
  { id: 'dumpling', label: 'Samosa / Momos' },
  { id: 'egg', label: 'Egg / Omelette' },
  { id: 'bread', label: 'Bread / Pav' },
  { id: 'cookie', label: 'Biscuits' },
  { id: 'chocolate', label: 'Chocolate' },
  { id: 'candy', label: 'Toffee / Candy' },
  { id: 'icecream', label: 'Ice cream' },
  { id: 'cigarette', label: 'Cigarette' },
  { id: 'plate', label: 'Other food' },
]

const keywords: [RegExp, string][] = [
  [/maggi|noodle|chowmein|yippee|ramen/i, 'noodles'],
  [/chai|tea\b|green tea/i, 'tea'],
  [/coffee|cappuccino|espresso|nescafe/i, 'coffee'],
  [/juice|frooti|maaza|slice|real\b|tropicana/i, 'juice'],
  [/water|bisleri|kinley|aquafina/i, 'water'],
  [/lassi|milk|chaas|buttermilk/i, 'milk'],
  [/shake|smoothie|boba|bubble/i, 'bubbletea'],
  [/cold ?drink|coke|cola|pepsi|sprite|thums|limca|fanta|soda|mountain dew|dew|7 ?up|red ?bull|energy|sting|monster/i, 'soda'],
  [/chips|lays|lay's|kurkure|bingo|uncle|fries|pringles/i, 'fries'],
  [/popcorn/i, 'popcorn'],
  [/peanut|namkeen|bhujia|mixture|haldiram|chana/i, 'peanuts'],
  [/sandwich|toast/i, 'sandwich'],
  [/burger/i, 'burger'],
  [/pizza/i, 'pizza'],
  [/hot ?dog/i, 'hotdog'],
  [/samosa|momo|kachori|pakora|pakoda|spring roll|dumpling/i, 'dumpling'],
  [/egg|omelet|anda|bhurji/i, 'egg'],
  [/bread|pav|bun\b|vada pav|pav bhaji/i, 'bread'],
  [/biscuit|cookie|parle|oreo|bourbon|good ?day/i, 'cookie'],
  [/chocolate|dairy milk|kitkat|kit kat|5 ?star|munch|snickers/i, 'chocolate'],
  [/toffee|candy|gum|mint|eclairs|lollipop/i, 'candy'],
  [/ice ?cream|kulfi|cone|cornetto/i, 'icecream'],
  [/cig|smoke|gold ?flake|marlboro|classic|navy ?cut|wills|bidi|beedi/i, 'cigarette'],
]

const ids = new Set(foodImages.map((f) => f.id))

export function suggestFoodImage(productName: string): string {
  for (const [pattern, id] of keywords) if (pattern.test(productName)) return id
  return 'plate'
}

/** Picture for a product: the one the admin chose, else a suggestion from its name. */
export function productImageId(product: { name: string; image?: string | null }): string {
  return product.image && ids.has(product.image) ? product.image : suggestFoodImage(product.name)
}

export function foodImageUrl(id: string): string {
  return `/food/${ids.has(id) ? id : 'plate'}.png`
}
