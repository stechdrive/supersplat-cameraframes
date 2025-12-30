import type { CameraFramesState } from './camera-frames-types';
import type { Events } from './events';
import type { Scene } from './scene';

export type CameraFramesContext = {
    events: Events;
    scene: Scene;
    state: CameraFramesState;
};
