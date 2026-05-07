/**
 * Фабрики РЕАЛЬНЫХ объектов для тестов.
 *
 * Никаких mocks — только конкретные RollType / Room с integer mm-размерами.
 *
 * Convention направления:
 *  - createRoom(name, widthM, lengthM): width = короткая сторона (поперёк рулона),
 *    length = длинная сторона (вдоль рулона). UI потом выбирает ориентацию сам.
 *  - createRoll(widthM, lengthM): width = ширина полосы рулона, length = длина рулона.
 */

import type { RollType, Room } from '../../src/domain/types';

export const createRoll = (widthM: number, lengthM: number): RollType => ({
  id: `roll-${widthM}x${lengthM}`,
  width: Math.round(widthM * 1000),
  length: Math.round(lengthM * 1000)
});

export const createRoom = (name: string, widthM: number, lengthM: number): Room => ({
  id: `room-${name}`,
  name,
  width: Math.round(widthM * 1000),
  length: Math.round(lengthM * 1000)
});
