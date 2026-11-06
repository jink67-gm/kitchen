// 요리사 한 명의 그림: 그림자, 몸, 손에 든 물건, 말풍선, 이름표. 나와 모둠원이 함께 쓴다.
const FONT = 'Galmuri11, sans-serif';

// 방향 번호: 0 아래, 1 오른쪽, 2 위, 3 왼쪽
export function dirCode(dir) {
  if (Math.abs(dir.x) > Math.abs(dir.y)) return dir.x > 0 ? 1 : 3;
  return dir.y < 0 ? 2 : 0;
}

export class ChefView {
  constructor(scene, textureKey, x, y, name = '') {
    this.scene = scene;
    this.textureKey = textureKey;
    this.frame = 'front';
    this.shadow = scene.add.image(x, y, 'shadow').setScale(1.05, 1);
    this.body = scene.add.image(x, y, `${textureKey}-front`).setOrigin(0.5, 0.95);
    this.held = scene.add.container(x, y).setVisible(false);
    this.bubble = scene.add.container(x, y).setDepth(4500).setVisible(false);
    this.handKey = '';
    this.label = name
      ? scene.add
          .text(x, y, name, {
            fontFamily: FONT,
            fontSize: '16px',
            color: '#ffffff',
            backgroundColor: '#2b2118cc',
            padding: { x: 6, y: 2 },
            resolution: 2,
          })
          .setOrigin(0.5, 0)
          .setDepth(4400)
      : null;
  }

  update(x, y, moving, dir, hand, time) {
    const bob = moving ? Math.abs(Math.sin(time / 90)) * 7 : Math.sin(time / 420) * 1.2;
    const tilt = moving ? Math.sin(time / 90) * 0.07 : 0;
    this.body.setPosition(x, y + 16 - bob).setRotation(tilt).setDepth(y + 10);
    this.shadow.setPosition(x, y + 16).setDepth(y + 9);

    const frame = dir === 0 ? 'front' : dir === 2 ? 'back' : 'side';
    if (frame !== this.frame) {
      this.body.setTexture(`${this.textureKey}-${frame}`);
      this.frame = frame;
    }
    this.body.setFlipX(dir === 3);

    const hx = dir === 1 ? 36 : dir === 3 ? -36 : 0;
    const hy = dir === 2 ? -116 : -28;
    this.held.setPosition(x + hx, y + hy - bob).setDepth(dir === 2 ? y + 9 : y + 11);
    this.bubble.setPosition(x, y - 150);
    this.label?.setPosition(x, y + 24);

    const key = hand ? JSON.stringify(hand) : '';
    if (key !== this.handKey) {
      this.handKey = key;
      this.renderHand(hand);
    }
  }

  renderHand(item) {
    const { scene } = this;
    this.bubble.removeAll(true);
    this.held.removeAll(true);
    this.bubble.setVisible(!!item);
    this.held.setVisible(!!item);
    if (!item) return;
    scene.fillItemView(this.held, item, false);

    const style = { fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: '#2b2b2b', resolution: 2 };
    const addCard = (width, height, children) => {
      const card = scene.add.graphics();
      card.fillStyle(0xffffff, 1).fillRoundedRect(-width / 2, -height / 2, width, height, 12);
      card.lineStyle(3, 0x2b2118, 1).strokeRoundedRect(-width / 2, -height / 2, width, height, 12);
      card.fillStyle(0xffffff, 1).fillTriangle(-10, height / 2 - 2, 10, height / 2 - 2, 0, height / 2 + 13);
      card.lineStyle(3, 0x2b2118, 1).lineBetween(-10, height / 2, 0, height / 2 + 13).lineBetween(10, height / 2, 0, height / 2 + 13);
      this.bubble.add([card, ...children]);
    };
    if (item.kind === 'ingredient') {
      const t = scene.add.text(0, 0, item.ingredient, style).setOrigin(0, 0.5);
      const f = scene.drawAmount(0, 0, item.amount, item.unit, 21);
      const width = t.width + f.fracWidth + 40;
      t.x = -width / 2 + 14;
      f.x = width / 2 - 14 - f.fracWidth / 2;
      addCard(width, 58, [t, f]);
    } else {
      const word = item.kind === 'pot' ? '냄비' : item.meal ? item.meal.dish : '빈 접시';
      const t = scene.add.text(0, 0, word, style).setOrigin(0.5);
      addCard(t.width + 30, 44, [t]);
    }
  }

  destroy() {
    [this.shadow, this.body, this.held, this.bubble, this.label].forEach((o) => o?.destroy());
  }
}
