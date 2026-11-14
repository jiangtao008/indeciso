import assert from 'node:assert/strict'
import { parseItemsText, formatItemsText } from '../shared/csv'

// Basic two-column format without header
let r = parseItemsText('西红柿鸡蛋,/uploads/a.png\n红烧肉,\n兰州拉面')
assert.equal(r.errors.length, 0)
assert.equal(r.items.length, 3)
assert.equal(r.items[0].title, '西红柿鸡蛋')
assert.equal(r.items[0].imageUrl, '/uploads/a.png')
assert.equal(r.items[1].imageUrl, '')
assert.equal(r.items[2].title, '兰州拉面')

// Quoted comma + escaped quotes + empty field + header
r = parseItemsText('名称,图片路径,分类\n"宫保鸡丁,微辣",/uploads/b.png,川菜\n"他说""好吃""",,家常')
assert.equal(r.errors.length, 0)
assert.equal(r.items[0].title, '宫保鸡丁,微辣')
assert.equal(r.items[1].title, '他说"好吃"')

// Header reordered + extended fields
r = parseItemsText('图片路径,名称,权重,标签,收藏\n/uploads/x.png,火锅,2.5,辣|夜宵,是')
assert.equal(r.errors.length, 0)
assert.equal(r.items[0].title, '火锅')
assert.equal(r.items[0].weight, 2.5)
assert.deepEqual(r.items[0].tags, ['辣', '夜宵'])
assert.equal(r.items[0].isFavorite, true)

// Unknown trailing future column is accepted and ignored
r = parseItemsText('名称,图片路径,备注\n火锅,,好吃')
assert.equal(r.errors.length, 0)
assert.equal(r.items[0].title, '火锅')

// Unclosed quote reported
r = parseItemsText('"红烧肉,/uploads/x.png')
assert.equal(r.errors.length, 1)
assert.equal(r.errors[0].line, 1)

// Invalid weight blocks the row
r = parseItemsText('火锅,,0\n烧烤,,abc\n拉面,,1')
assert.equal(r.items.length, 1)
assert.equal(r.items[0].title, '拉面')
assert.equal(r.errors.length, 2)
assert.equal(r.errors[0].line, 1)
assert.equal(r.errors[1].line, 2)

// Title and image both empty rejected
r = parseItemsText('火锅,,\n ,,1')
assert.equal(r.errors.length, 1)

// Blank lines ignored
r = parseItemsText('\n\n火锅\n\n烧烤\n')
assert.equal(r.errors.length, 0)
assert.equal(r.items.length, 2)

// CRLF + BOM
r = parseItemsText('﻿火锅,,\r\n烧烤,,\r\n')
assert.equal(r.errors.length, 0)
assert.equal(r.items.length, 2)

// Bad image path
r = parseItemsText('火锅,not-a-path')
assert.equal(r.errors.length, 1)

// Round trip extended
const text = formatItemsText([
  { title: '宫保鸡丁,微辣', imageUrl: '/uploads/a.png', weight: 2, category: '川菜', tags: ['下饭', '经典'], isFavorite: true },
  { title: '兰州拉面', imageUrl: '', weight: 1, category: '', tags: [], isFavorite: false },
])
const rc = parseItemsText(text)
assert.equal(rc.errors.length, 0)
assert.equal(rc.items.length, 2)
assert.equal(rc.items[0].title, '宫保鸡丁,微辣')
assert.equal(rc.items[0].weight, 2)
assert.equal(rc.items[0].isFavorite, true)

// Two-column output stays two columns when no extended data
const basic = formatItemsText([
  { title: '火锅', imageUrl: '', weight: 1, category: '', tags: [], isFavorite: false },
])
assert.equal(basic, '火锅,')

console.log('csv tests passed')
