class Particle {
  constructor(x, y) {
    this.x        = x;
    this.y        = y;
    this.on       = false;
    this.b        = 0;
    this.ns       = null;
    this.selected = false;
  }

  show() {
    if (!this.on) {
      noStroke(); fill(255);
      rect(this.x + cs / 2, this.y + cs / 2, 1, 1);
      return;
    }

    let r = this.selected ? 255 : 255;
    let g = this.selected ? 220 : 255;
    let b = this.selected ?   0 : 255;

    switch (this.b) {
      case "RECTANGLE":
        noStroke(); fill(r, g, b);
        rect(this.x, this.y, cs, cs);
        break;

      case "RECTANGLE_OUTLINE":
        noFill(); stroke(r, g, b);
        rect(this.x + 0.5, this.y + 0.5, cs - 1, cs - 1);
        break;

      case "ELLIPSE":
        noFill(); stroke(r, g, b);
        ellipse(this.x + cs / 2, this.y + cs / 2, cs, cs);
        break;

      case "ELLIPSE_FILLED":
        noStroke(); fill(r, g, b);
        ellipse(this.x + cs / 2, this.y + cs / 2, cs, cs);
        break;

      case "CROSS":
        noFill(); stroke(r, g, b);
        line(this.x,      this.y,      this.x + cs, this.y + cs);
        line(this.x,      this.y + cs, this.x + cs, this.y);
        break;

      case "NOISE":
        if (this.selected) {
          tint(255, 220, 0);
        } else {
          noTint();
        }
        image(this.ns, this.x, this.y);
        noTint();
        break;

      case "HATCHED": {
        noFill(); stroke(r, g, b);
        let d = cs / 10;
        for (let off = 0; off < cs; off += d) {
          line(this.x + off, this.y,      this.x,      this.y + off);
          line(this.x + off, this.y + cs, this.x + cs, this.y + off);
        }
        break;
      }

      case "DIAMOND":
        noStroke(); fill(r, g, b);
        quad(
          this.x,           this.y + cs / 2,
          this.x + cs / 2,  this.y,
          this.x + cs,      this.y + cs / 2,
          this.x + cs / 2,  this.y + cs
        );
        break;

      case "DIAMOND_OUTLINE":
        noFill(); stroke(r, g, b);
        quad(
          this.x + 1,       this.y + cs / 2,
          this.x + cs / 2,  this.y + 1,
          this.x + cs - 1,  this.y + cs / 2,
          this.x + cs / 2,  this.y + cs - 1
        );
        break;
    }
  }
}
