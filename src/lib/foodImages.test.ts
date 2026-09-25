import { describe, expect, it } from 'vitest'
import { foodImageUrl, productImageId, suggestFoodImage } from './foodImages'

describe('food images', () => {
  it('suggests a picture from the product name', () => {
    expect(suggestFoodImage('Maggi')).toBe('noodles')
    expect(suggestFoodImage('Masala Chai')).toBe('tea')
    expect(suggestFoodImage('Coke 250ml')).toBe('soda')
    expect(suggestFoodImage('Water bottle')).toBe('water')
    expect(suggestFoodImage('Gold Flake')).toBe('cigarette')
    expect(suggestFoodImage("Lay's chips")).toBe('fries')
    expect(suggestFoodImage('Veg Samosa')).toBe('dumpling')
    expect(suggestFoodImage('Something new')).toBe('plate')
  })

  it("prefers the admin's choice, falling back when it is unknown", () => {
    expect(productImageId({ name: 'Maggi', image: 'pizza' })).toBe('pizza')
    expect(productImageId({ name: 'Maggi', image: 'nope' })).toBe('noodles')
    expect(productImageId({ name: 'Maggi', image: null })).toBe('noodles')
    expect(foodImageUrl('nope')).toBe('/food/plate.png')
  })
})
