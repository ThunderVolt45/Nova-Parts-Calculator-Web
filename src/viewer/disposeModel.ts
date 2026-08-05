import {
  Material,
  Mesh,
  Object3D,
  Texture,
} from 'three'

function disposeMaterial(material: Material, textures: Set<Texture>) {
  for (const value of Object.values(material)) {
    if (value instanceof Texture) textures.add(value)
  }
  material.dispose()
}

export function disposeModelObject(root: Object3D) {
  const geometries = new Set<NonNullable<Mesh['geometry']>>()
  const materials = new Set<Material>()
  const textures = new Set<Texture>()
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return
    geometries.add(object.geometry)
    const meshMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material]
    for (const material of meshMaterials) materials.add(material)
  })
  for (const geometry of geometries) geometry.dispose()
  for (const material of materials) disposeMaterial(material, textures)
  for (const texture of textures) texture.dispose()
  return {
    geometries: geometries.size,
    materials: materials.size,
    textures: textures.size,
  }
}

