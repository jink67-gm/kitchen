// 주방 장면이 공유 상태를 읽고 바꾸는 창구. 혼자 하기와 모둠 하기의 차이를 여기에 가둔다.
// view: 지금의 상태, act(fn): 상태를 바꾸는 함수를 실행하고 그 결과를 Promise로 돌려준다.
import { decode, encode, newGame } from './teamState.js';

export class LocalSession {
  constructor(stage) {
    this.view = newGame(stage);
    this.now = () => performance.now();
    this.log = [];
  }

  act(fn) {
    return Promise.resolve(fn(this.view));
  }

  addLog(entry) {
    this.log.push(entry);
  }

  publishPosition() {}

  destroy() {}
}

export class OnlineSession {
  constructor({ conn, teamPath, stage, uid, onPositions, onError }) {
    this.conn = conn;
    this.teamPath = teamPath;
    this.stage = stage;
    this.uid = uid;
    this.view = newGame(stage);
    this.now = () => conn.now();
    this.unsubscribe = [
      conn.onValue(`${teamPath}/game`, (raw) => {
        this.view = decode(raw, stage);
      }, onError),
      conn.onValue(`${teamPath}/pos`, (raw) => onPositions?.(raw ?? {}), onError),
    ];
    conn.onDisconnectRemove(`${teamPath}/pos/${uid}`);
  }

  // 집기·놓기를 트랜잭션으로 처리해 두 명이 같은 물건을 동시에 집지 못하게 한다.
  async act(fn) {
    let result = { changed: false };
    await this.conn.transaction(`${this.teamPath}/game`, (current) => {
      if (current === null) return null; // 캐시가 비었으면 서버 값을 받아 다시 실행된다
      const game = decode(current, this.stage);
      result = fn(game);
      return result?.changed ? encode(game) : undefined;
    });
    return result;
  }

  addLog(entry) {
    this.conn.push(`${this.teamPath}/log`, { uid: this.uid, at: this.now(), ...entry });
  }

  publishPosition(pos) {
    this.conn.set(`${this.teamPath}/pos/${this.uid}`, pos);
  }

  destroy() {
    this.unsubscribe.forEach((off) => off());
  }
}
