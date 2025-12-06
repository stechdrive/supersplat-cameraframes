import { Entity, Ray, Vec3 } from 'playcanvas';

import { Scene } from './scene';

const ray = new Ray();
const vec = new Vec3();

export const hitTestGizmo = (scene: Scene, clientX: number, clientY: number): boolean => {
    // 常に最新のターゲットサイズを使用
    const targetSize = scene.targetSize;
    if (targetSize.width <= 0 || targetSize.height <= 0) {
        return false;
    }

    const canvas = scene.canvas;
    const rect = canvas.getBoundingClientRect();

    // キャンバス内座標に変換
    // clientX/Y はビューポート基準。canvas が何らかのCSS変形で配置されていても
    // getBoundingClientRect & ターゲットサイズ比率で内部解像度座標へマッピングする。
    const x = (clientX - rect.left) / rect.width * targetSize.width;
    const y = (clientY - rect.top) / rect.height * targetSize.height;

    const camera = scene.camera;
    camera.getRay(x, y, ray);

    // Gizmoレイヤー上のレンダリング可能なメッシュを持つエンティティと交差判定
    // Gizmoは通常 BoundingBox を持っているか、メッシュインスタンスがある。
    // ここでは簡易的に、Gizmoレイヤーに所属するエンティティのワールドバウンドと交差するかチェックする。
    // （厳密なメッシュ交差までは不要なケースが多いが、必要なら追加する）

    const gizmoLayerId = scene.gizmoLayer.id;
    // シーンルートから全走査するのはコスト高だが、Gizmoは通常数が少ない。
    // ただし、scene.gizmoLayer に直接所属しているリストが取れれば早いが、PlayCanvasのLayerはMeshInstanceを持つ。

    // scene.app.scene.layers.getLayerById(gizmoLayerId).meshInstances
    // から MeshInstance を列挙し、その AABB とレイの交差を判定するのが最も効率的。

    const layer = scene.app.scene.layers.getLayerById(gizmoLayerId);
    if (!layer) return false;

    const meshInstances = layer.meshInstances;
    let hit = false;
    // 近い順である必要はなく、一つでも当たればよい
    for (let i = 0; i < meshInstances.length; i++) {
        const mi = meshInstances[i];
        if (!mi.visible) continue;

        // カリングマスクなどで非表示のものはスキップすべきだが、
        // GizmoレイヤーはUI的に表示されていれば判定対象として良い。

        if (mi.aabb.intersectsRay(ray)) {
            hit = true;
            break;
        }
    }

    return hit;
};
