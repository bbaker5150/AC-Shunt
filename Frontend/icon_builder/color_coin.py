import bpy

# --- CONFIGURATION ---
MESH_PATH = r"C:\Users\barry.baker\Development\AC Shunt\Frontend\icon_builder\3demblem.glb"
IMAGE_PATH = r"C:\Users\barry.baker\Development\AC Shunt\Frontend\icon_builder\navair-seal.png"
OUTPUT_PATH = r"C:\Users\barry.baker\Development\AC Shunt\Frontend\icon_builder\navair_coin_final.glb"

print("Initializing Blender standalone environment...")
bpy.ops.wm.read_factory_settings(use_empty=True)

print(f"Loading mesh from: {MESH_PATH}")
bpy.ops.import_scene.gltf(filepath=MESH_PATH)

# Target the imported mesh object
obj = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
bpy.context.view_layer.objects.active = obj

# --- FIX: ROBUST MATHEMATICAL UV GENERATION ---
print("Generating mathematical top-down UV layout mapping...")

# Force creation of a fresh UV layer layer
if not obj.data.uv_layers:
    uv_layer = obj.data.uv_layers.new(name="UVMap")
else:
    uv_layer = obj.data.uv_layers.active

# Calculate bounding boxes to perfectly fit the image to the mesh bounds
min_x = min(v.co.x for v in obj.data.vertices)
max_x = max(v.co.x for v in obj.data.vertices)
min_y = min(v.co.y for v in obj.data.vertices)
max_y = max(v.co.y for v in obj.data.vertices)

size_x = max_x - min_x if max_x != min_x else 1.0
size_y = max_y - min_y if max_y != min_y else 1.0

# Map mesh X and Y coordinates directly to UV space ranges [0, 1]
for poly in obj.data.polygons:
    for loop_index in poly.loop_indices:
        vertex_index = obj.data.loops[loop_index].vertex_index
        co = obj.data.vertices[vertex_index].co
        
        # Calculate flat normalized 2D coordinates
        u = (co.x - min_x) / size_x
        v = (co.y - min_y) / size_y
        
        # Assign directly to the UV map layer loop data
        uv_layer.data[loop_index].uv = (u, v)

print("UV coordinates mapped natively via geometry limits!")
uv_name = uv_layer.name

# 3. Handle Material Node Tree
if not obj.data.materials:
    mat = bpy.data.materials.new(name="CoinMaterial")
    obj.data.materials.append(mat)
else:
    mat = obj.data.materials[0]
    
mat.use_nodes = True
nodes = mat.node_tree.nodes
links = mat.node_tree.links
nodes.clear()

# 4. Rebuild Clean PBR Node Structure
node_output = nodes.new(type='ShaderNodeOutputMaterial')
node_principled = nodes.new(type='ShaderNodeBsdfPrincipled')
node_texture = nodes.new(type='ShaderNodeTexImage')
node_uv = nodes.new(type='ShaderNodeUVMap')

# Bind our newly calculated coordinates to the texture block
node_uv.uv_map = uv_name

# Position nodes
node_principled.location = (0, 0)
node_texture.location = (-300, 0)
node_uv.location = (-600, 0)

# 5. Load Image Map
try:
    img = bpy.data.images.load(IMAGE_PATH)
    node_texture.image = img
except Exception as e:
    print(f"Error loading image map: {e}")
    exit(1)

# 6. Link Everything Together
links.new(node_uv.outputs['UV'], node_texture.inputs['Vector'])
links.new(node_texture.outputs['Color'], node_principled.inputs['Base Color'])
links.new(node_principled.outputs['BSDF'], node_output.inputs['Surface'])

# Set realistic coin material behaviors
if 'Metallic' in node_principled.inputs:
    node_principled.inputs['Metallic'].default_value = 0.5
if 'Roughness' in node_principled.inputs:
    node_principled.inputs['Roughness'].default_value = 0.3

# 7. Export unified GLB file
print("Baking textures and exporting final app asset...")
bpy.ops.export_scene.gltf(
    filepath=OUTPUT_PATH,
    export_format='GLB',
    export_image_format='AUTO'
)

print(f"Success! Asset saved to: {OUTPUT_PATH}")