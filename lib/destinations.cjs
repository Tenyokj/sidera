const { randomUUID } = require("node:crypto")

const REAL_STARS = [
  { name: "Betelgeuse", distance: 548.7 },
  { name: "Rigel", distance: 863.0 },
  { name: "Vega", distance: 25.0 },
  { name: "Altair", distance: 16.7 },
  { name: "Arcturus", distance: 36.7 },
  { name: "Tau Ceti", distance: 11.9 },
  { name: "Polaris", distance: 433.8 },
  { name: "Antares", distance: 550.0 }
]

const DISTANCE_BUCKETS = [
  { key: "near", min: 4, max: 20, weight: 52 },
  { key: "mid", min: 20, max: 200, weight: 28 },
  { key: "far", min: 200, max: 2000, weight: 14 },
  { key: "deep", min: 2000, max: 12000, weight: 6 }
]

const STAR_COLOR_BUCKETS = {
  near: [
    { core: "#ffffff", glow: "rgba(255, 255, 255, 0.95)", halo: "rgba(255, 255, 255, 0.34)" },
    { core: "#ffe15a", glow: "rgba(255, 224, 82, 0.96)", halo: "rgba(255, 224, 82, 0.34)" },
    { core: "#ffb35c", glow: "rgba(255, 177, 82, 0.95)", halo: "rgba(255, 177, 82, 0.34)" }
  ],
  mid: [
    { core: "#53ffa2", glow: "rgba(66, 255, 154, 0.96)", halo: "rgba(66, 255, 154, 0.34)" },
    { core: "#7ef4ff", glow: "rgba(103, 242, 255, 0.96)", halo: "rgba(103, 242, 255, 0.34)" },
    { core: "#65b5ff", glow: "rgba(91, 170, 255, 0.95)", halo: "rgba(91, 170, 255, 0.36)" }
  ],
  far: [
    { core: "#65b5ff", glow: "rgba(91, 170, 255, 0.95)", halo: "rgba(91, 170, 255, 0.36)" },
    { core: "#bf7bff", glow: "rgba(191, 122, 255, 0.95)", halo: "rgba(191, 122, 255, 0.34)" },
    { core: "#ff7de3", glow: "rgba(255, 120, 226, 0.95)", halo: "rgba(255, 120, 226, 0.34)" }
  ],
  deep: [
    { core: "#bf7bff", glow: "rgba(191, 122, 255, 0.95)", halo: "rgba(191, 122, 255, 0.34)" },
    { core: "#ff7de3", glow: "rgba(255, 120, 226, 0.95)", halo: "rgba(255, 120, 226, 0.34)" },
    { core: "#7ef4ff", glow: "rgba(103, 242, 255, 0.96)", halo: "rgba(103, 242, 255, 0.34)" }
  ]
}

const PROCEDURAL_PREFIXES = [
  "Astra",
  "Vanta",
  "Lumen",
  "Noctis",
  "Signal",
  "Archive",
  "Halo",
  "Vector",
  "Drift",
  "Echo",
  "Nyx",
  "Helio",
  "Orion",
  "Sidera"
]

const PROCEDURAL_SUFFIXES = [
  "Reach",
  "Node",
  "Spire",
  "Field",
  "Crown",
  "Delta",
  "Gate",
  "Veil",
  "Bloom",
  "Array",
  "Trace",
  "Belt"
]

const PROCEDURAL_SECTORS = ["VX", "QN", "AR", "KX", "LM", "SR", "NT", "HX", "IO", "ZD"]

const SLOT_LAYOUT = [
  { xRatio: 0.12, yRatio: 0.14 },
  { xRatio: 0.28, yRatio: 0.1 },
  { xRatio: 0.44, yRatio: 0.16 },
  { xRatio: 0.62, yRatio: 0.12 },
  { xRatio: 0.82, yRatio: 0.18 },
  { xRatio: 0.18, yRatio: 0.28 },
  { xRatio: 0.36, yRatio: 0.34 },
  { xRatio: 0.54, yRatio: 0.26 },
  { xRatio: 0.74, yRatio: 0.32 },
  { xRatio: 0.88, yRatio: 0.28 },
  { xRatio: 0.1, yRatio: 0.48 },
  { xRatio: 0.28, yRatio: 0.56 },
  { xRatio: 0.48, yRatio: 0.44 },
  { xRatio: 0.66, yRatio: 0.52 },
  { xRatio: 0.84, yRatio: 0.46 },
  { xRatio: 0.16, yRatio: 0.7 },
  { xRatio: 0.34, yRatio: 0.82 },
  { xRatio: 0.52, yRatio: 0.68 },
  { xRatio: 0.72, yRatio: 0.78 },
  { xRatio: 0.9, yRatio: 0.7 }
]

function generateDestination() {
  const bucket = pickWeightedDistanceBucket()
  const realStar = maybePickRealStar(bucket)
  const distance = realStar ? realStar.distance : generateDistance(bucket)

  return {
    name: realStar ? realStar.name : generateProceduralName(bucket.key),
    distance,
    bucketKey: bucket.key
  }
}

function normalizeDestination(destination) {
  if (
    destination &&
    typeof destination.name === "string" &&
    Number.isFinite(destination.distance) &&
    typeof destination.bucketKey === "string"
  ) {
    return {
      name: destination.name.trim() || generateDestination().name,
      distance: Number(destination.distance),
      bucketKey: DISTANCE_BUCKETS.some((bucket) => bucket.key === destination.bucketKey)
        ? destination.bucketKey
        : bucketFromDistance(destination.distance)
    }
  }

  return generateDestination()
}

function resolveSlot(sectorIndex, slotIndex) {
  const rotatedIndex = (slotIndex + (sectorIndex * 7) % SLOT_LAYOUT.length) % SLOT_LAYOUT.length
  const baseSlot = SLOT_LAYOUT[rotatedIndex]
  const xJitter = (((sectorIndex + slotIndex * 3) % 5) - 2) * 0.008
  const yJitter = (((sectorIndex * 2 + slotIndex) % 5) - 2) * 0.01

  return {
    xRatio: clamp(Number((baseSlot.xRatio + xJitter).toFixed(3)), 0.08, 0.92),
    yRatio: clamp(Number((baseSlot.yRatio + yJitter).toFixed(3)), 0.1, 0.88)
  }
}

function pickStarColor(bucketKey) {
  const palette = STAR_COLOR_BUCKETS[bucketKey] || STAR_COLOR_BUCKETS.near
  return randomFrom(palette)
}

function pickStarSize(bucketKey) {
  if (bucketKey === "near") {
    return randomBetween(16, 24)
  }

  if (bucketKey === "mid") {
    return randomBetween(14, 22)
  }

  if (bucketKey === "far") {
    return randomBetween(13, 20)
  }

  return randomBetween(12, 18)
}

function createSignalRecord({ message, destination, totalCount }) {
  const sectorIndex = Math.floor(totalCount / 20)
  const slotIndex = totalCount % 20
  const slot = resolveSlot(sectorIndex, slotIndex)
  const colors = pickStarColor(destination.bucketKey)
  const sizePx = pickStarSize(destination.bucketKey)

  return {
    id: randomUUID(),
    message,
    destination: destination.name,
    distance: destination.distance,
    bucketKey: destination.bucketKey,
    sectorIndex,
    slotIndex,
    xRatio: slot.xRatio,
    yRatio: slot.yRatio,
    size: sizePx,
    core: colors.core,
    glow: colors.glow,
    halo: colors.halo,
    createdAt: Date.now()
  }
}

function maybePickRealStar(bucket) {
  if (Math.random() > 0.26) {
    return null
  }

  const matchingStars = REAL_STARS.filter(
    (star) => star.distance >= bucket.min && star.distance <= bucket.max
  )

  if (!matchingStars.length) {
    return null
  }

  return randomFrom(matchingStars)
}

function generateProceduralName(bucketKey) {
  if (bucketKey === "deep") {
    return `Sector ${randomFrom(PROCEDURAL_SECTORS)}-${randomBetween(120, 999)}`
  }

  if (Math.random() > 0.5) {
    return `${randomFrom(PROCEDURAL_PREFIXES)} ${randomFrom(PROCEDURAL_SUFFIXES)}`
  }

  return `${randomFrom(PROCEDURAL_PREFIXES)} ${randomFrom(PROCEDURAL_SECTORS)}-${randomBetween(12, 94)}`
}

function generateDistance(bucket) {
  if (bucket.key === "near" || bucket.key === "mid") {
    return Number((Math.random() * (bucket.max - bucket.min) + bucket.min).toFixed(1))
  }

  return Math.round(Math.random() * (bucket.max - bucket.min) + bucket.min)
}

function pickWeightedDistanceBucket() {
  const totalWeight = DISTANCE_BUCKETS.reduce((sum, bucket) => sum + bucket.weight, 0)
  let threshold = Math.random() * totalWeight

  for (const bucket of DISTANCE_BUCKETS) {
    threshold -= bucket.weight

    if (threshold <= 0) {
      return bucket
    }
  }

  return DISTANCE_BUCKETS[0]
}

function bucketFromDistance(distance) {
  return DISTANCE_BUCKETS.find((bucket) => distance >= bucket.min && distance < bucket.max)?.key || "deep"
}

function randomBetween(min, max) {
  return Math.round(Math.random() * (max - min) + min)
}

function randomFrom(items) {
  return items[randomBetween(0, items.length - 1)]
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

module.exports = {
  createSignalRecord,
  generateDestination,
  normalizeDestination
}
