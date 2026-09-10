import { describe, expect, it } from 'vitest'
import {
  HIGHLIGHT_GEOMETRY_SIZE_THRESHOLD_BYTES,
  HIGHLIGHT_MAX_VERTICES,
  HIGHLIGHT_SIMPLIFY_TOLERANCE_DEGREES,
  countGeoJsonVertices,
  estimateGeoJsonBytes,
  isLargeHighlightGeometry,
  prepareAoiHighlightGeometry,
  simplifyHighlightGeometry,
  simplifyHighlightGeometryToVertexBudget,
} from '@/utils/prepareAoiHighlightGeometry'

function buildPolygonGeoJson(pointCount: number): GeoJSON.FeatureCollection {
  const ring: [number, number][] = []

  const centerLongitude = -47.9
  const centerLatitude = -15.8

  const baseRadius = 0.25

  for (let index = 0; index < pointCount; index += 1) {
    const angle = (index / pointCount) * Math.PI * 2

    const boundaryVariation =
      1 +
      0.08 * Math.sin(angle * 5) +
      0.04 * Math.sin(angle * 13) +
      0.02 * Math.cos(angle * 29)

    const radius = baseRadius * boundaryVariation

    const longitude = centerLongitude + Math.cos(angle) * radius * 1.15
    const latitude = centerLatitude + Math.sin(angle) * radius

    ring.push([longitude, latitude])
  }

  if (ring.length > 0) {
    ring.push([...ring[0]!] as [number, number])
  }

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [ring],
        },
        properties: {
          name: 'Test Area of Interest',
        },
      },
    ],
  }
}

describe('prepareAoiHighlightGeometry', () => {
  it('should return the original geometry when below the size threshold', () => {
    const geojson = buildPolygonGeoJson(20)

    expect(isLargeHighlightGeometry(geojson)).toBe(false)
    expect(prepareAoiHighlightGeometry(geojson)).toBe(geojson)
  })

  it('should simplify large geometries before map highlight', () => {
    const geojson = buildPolygonGeoJson(15_000)

    expect(estimateGeoJsonBytes(geojson)).toBeGreaterThanOrEqual(
      HIGHLIGHT_GEOMETRY_SIZE_THRESHOLD_BYTES,
    )
    expect(isLargeHighlightGeometry(geojson)).toBe(true)

    const simplified = prepareAoiHighlightGeometry(
      geojson,
    ) as GeoJSON.FeatureCollection

    const originalGeometry = geojson.features[0]?.geometry
    const simplifiedGeometry = simplified.features[0]?.geometry

    const originalRing =
      originalGeometry?.type === 'Polygon'
        ? originalGeometry.coordinates[0]
        : []

    const simplifiedRing =
      simplifiedGeometry?.type === 'Polygon'
        ? simplifiedGeometry.coordinates[0]
        : []

    expect(simplified.type).toBe('FeatureCollection')
    expect(simplifiedRing.length).toBeLessThan(originalRing.length)

    expect(countGeoJsonVertices(simplified)).toBeLessThanOrEqual(
      HIGHLIGHT_MAX_VERTICES,
    )

    expect(estimateGeoJsonBytes(simplified)).toBeLessThan(
      estimateGeoJsonBytes(geojson),
    )
  })

  it('should escalate tolerance until the requested vertex budget is reached', () => {
    const geojson = buildPolygonGeoJson(2_000)
    const testVertexBudget = 50

    const result = simplifyHighlightGeometryToVertexBudget(
      geojson,
      testVertexBudget,
    )

    expect(result.iterations).toBeGreaterThan(1)

    expect(result.toleranceDegrees).toBeGreaterThan(
      HIGHLIGHT_SIMPLIFY_TOLERANCE_DEGREES,
    )

    expect(countGeoJsonVertices(result.geometry)).toBeLessThanOrEqual(
      testVertexBudget,
    )
  })

  it('should preserve feature collection type when simplifying explicitly', () => {
    const geojson = buildPolygonGeoJson(200)

    const simplified = simplifyHighlightGeometry(
      geojson,
    ) as GeoJSON.FeatureCollection

    expect(simplified.type).toBe('FeatureCollection')
    expect(simplified.features).toHaveLength(1)
    expect(simplified.features[0]?.geometry.type).toBe('Polygon')
  })
})

describe('countGeoJsonVertices', () => {
  it('should count vertices for each supported geometry type', () => {
    expect(
      countGeoJsonVertices({
        type: 'Point',
        coordinates: [-47.9, -15.8],
      }),
    ).toBe(1)

    expect(
      countGeoJsonVertices({
        type: 'MultiPoint',
        coordinates: [
          [-47.9, -15.8],
          [-47.8, -15.7],
        ],
      }),
    ).toBe(2)

    expect(
      countGeoJsonVertices({
        type: 'LineString',
        coordinates: [
          [-47.9, -15.8],
          [-47.8, -15.7],
          [-47.7, -15.6],
        ],
      }),
    ).toBe(3)

    expect(
      countGeoJsonVertices({
        type: 'MultiLineString',
        coordinates: [
          [
            [-47.9, -15.8],
            [-47.8, -15.7],
          ],
          [
            [-47.7, -15.6],
            [-47.6, -15.5],
          ],
        ],
      }),
    ).toBe(4)

    expect(
      countGeoJsonVertices({
        type: 'Polygon',
        coordinates: [
          [
            [-47.9, -15.8],
            [-47.8, -15.8],
            [-47.8, -15.7],
            [-47.9, -15.8],
          ],
          [
            [-47.85, -15.75],
            [-47.82, -15.75],
            [-47.82, -15.72],
            [-47.85, -15.75],
          ],
        ],
      }),
    ).toBe(8)

    expect(
      countGeoJsonVertices({
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [-47.9, -15.8],
              [-47.8, -15.8],
              [-47.8, -15.7],
              [-47.9, -15.8],
            ],
          ],
          [
            [
              [-47.7, -15.6],
              [-47.6, -15.6],
              [-47.6, -15.5],
              [-47.7, -15.6],
            ],
          ],
        ],
      }),
    ).toBe(8)
  })

  it('should count vertices for Feature, FeatureCollection and GeometryCollection', () => {
    expect(
      countGeoJsonVertices({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [-47.9, -15.8],
        },
        properties: {},
      }),
    ).toBe(1)

    expect(
      countGeoJsonVertices({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [
                [-47.9, -15.8],
                [-47.8, -15.7],
              ],
            },
            properties: {},
          },
          {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [-47.7, -15.6],
            },
            properties: {},
          },
        ],
      }),
    ).toBe(3)

    expect(
      countGeoJsonVertices({
        type: 'GeometryCollection',
        geometries: [
          { type: 'Point', coordinates: [-47.9, -15.8] },
          {
            type: 'LineString',
            coordinates: [
              [-47.8, -15.7],
              [-47.7, -15.6],
            ],
          },
        ],
      }),
    ).toBe(3)
  })

  it('should return zero for null, undefined or unsupported geometries', () => {
    expect(
      countGeoJsonVertices({
        type: 'Feature',
        geometry: null,
        properties: {},
      }),
    ).toBe(0)

    expect(
      countGeoJsonVertices({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: undefined,
            properties: {},
          },
        ],
      }),
    ).toBe(0)

    expect(
      countGeoJsonVertices({
        type: 'UnknownType' as GeoJSON.Geometry['type'],
        coordinates: [],
      } as GeoJSON.Geometry),
    ).toBe(0)
  })

  it('should treat invalid ring coordinates as zero vertices', () => {
    expect(
      countGeoJsonVertices({
        type: 'LineString',
        coordinates: null as unknown as GeoJSON.Position[],
      }),
    ).toBe(0)
  })
})

describe('isLargeHighlightGeometry', () => {
  it('should respect a custom byte threshold', () => {
    const geojson = buildPolygonGeoJson(20)
    const bytes = estimateGeoJsonBytes(geojson)

    expect(isLargeHighlightGeometry(geojson, bytes + 1)).toBe(false)
    expect(isLargeHighlightGeometry(geojson, bytes)).toBe(true)
  })
})