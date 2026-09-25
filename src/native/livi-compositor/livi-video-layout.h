/*
 * Video plane fitting — pure geometry, kept out of livi-compositor.c so it can be
 * checked on its own (compile a test with -I. and include this header).
 *
 * The plane covers an "available" box: the screen, minus the role's own insets
 * (the host's sidebar reserves a strip on the side it sits on). The stream's
 * visible region is contained in that box with a uniform scale, the slack is
 * centred, and the crop/tier then place the actual surface.
 */
#ifndef LIVI_VIDEO_LAYOUT_H
#define LIVI_VIDEO_LAYOUT_H

#include <math.h>

struct livi_video_geom {
	int x, y, w, h;
};

static inline struct livi_video_geom livi_fit_video(
	int origin_x, int origin_y, int avail_w, int avail_h,
	double vis_w, double vis_h, double tier_w, double tier_h,
	double crop_l, double crop_t)
{
	struct livi_video_geom g = { origin_x, origin_y, avail_w, avail_h };

	/* No crop info yet: the plane fills the available box as-is. */
	if (avail_w <= 0 || avail_h <= 0 || vis_w <= 0 || vis_h <= 0 ||
			tier_w <= 0 || tier_h <= 0) {
		return g;
	}

	double scx = (double)avail_w / vis_w;
	double scy = (double)avail_h / vis_h;
	double scale = scx < scy ? scx : scy;
	double off_x = (avail_w - vis_w * scale) / 2.0;
	double off_y = (avail_h - vis_h * scale) / 2.0;

	g.w = (int)lround(tier_w * scale);
	g.h = (int)lround(tier_h * scale);
	g.x = (int)lround(origin_x + off_x - crop_l * scale);
	g.y = (int)lround(origin_y + off_y - crop_t * scale);
	return g;
}

#endif
