/**
 * Модель полосы (Strip).
 *
 * Полоса — это вертикальный (вдоль room.length) столбец укладки покрытия,
 * шириной `stripWidth` (≤ roll.width) и общей нужной длиной `room.length`.
 * Полоса может быть составлена из одного или нескольких кусков (пiece),
 * если рулон короче помещения (нужны поперечные доборы).
 *
 * Используется в economy/optimal как итерационная единица.
 */

export type Strip = {
  /** Координата X левого края полосы в помещении, mm. */
  cursorX: number;
  /** Ширина полосы (поперёк рулона), mm. */
  stripWidth: number;
  /** Сколько ещё длины осталось положить (изначально room.length), mm. */
  needLength: number;
};

/**
 * Сгенерировать список полос для покрытия помещения шириной `roomWidth`
 * рулоном с шириной `rollWidth`. Полосы идут слева направо, последняя
 * может быть уже остальных (добор по ширине).
 */
export function planStrips(roomWidth: number, roomLength: number, rollWidth: number): Strip[] {
  const strips: Strip[] = [];
  let cursorX = 0;
  while (cursorX < roomWidth) {
    const stripWidth = Math.min(rollWidth, roomWidth - cursorX);
    strips.push({ cursorX, stripWidth, needLength: roomLength });
    cursorX += stripWidth;
  }
  return strips;
}
