// 휴대폰에는 파일 경로가 없음 → 참고 이미지 파일은 "없음"으로 (카드 그림은 2주차에 휴대폰 방식으로)
export const existsSync = () => false;
export const createReadStream = () => { throw new Error('휴대폰판에서는 파일 경로를 읽지 않아요'); };
export const readFileSync = createReadStream;
export default { existsSync, createReadStream, readFileSync };
