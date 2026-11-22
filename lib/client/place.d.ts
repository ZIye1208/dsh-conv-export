/**
 * 下拉菜单落点计算（纯函数，不读 DOM）。
 *
 * 为什么要单独成文件：菜单定位是「按钮在视口哪个位置 → 菜单往哪展开」的
 * 纯几何问题，抽出来可以直接单测；controller 只负责读矩形、调用、写样式。
 */
/** 触发按钮的视口矩形（只用到垂直边缘与右边缘）。 */
export interface AnchorRect {
    readonly top: number;
    readonly bottom: number;
    readonly right: number;
}
/** 菜单最终落点：left/top 为视口坐标，dir 为展开方向（决定入场动画）。 */
export interface MenuPlacement {
    readonly left: number;
    readonly top: number;
    readonly dir: 'up' | 'down';
}
/**
 * 计算下拉菜单落点：水平夹取在视口内；垂直优先向按钮下方展开，
 * 下方放不下时翻到按钮上方，上下都放不下时贴边夹取。
 * @param rect - 触发按钮的视口矩形。
 * @param menu - 菜单自身尺寸（宽、高）。
 * @param viewport - 视口尺寸（宽、高）。
 * @param margin - 距视口边缘的最小间距（默认 8px）。
 * @param gap - 菜单与按钮之间的间距（默认 6px）。
 * @returns 落点与展开方向。
 */
export declare function placeMenu(rect: AnchorRect, menu: {
    readonly width: number;
    readonly height: number;
}, viewport: {
    readonly width: number;
    readonly height: number;
}, margin?: number, gap?: number): MenuPlacement;
