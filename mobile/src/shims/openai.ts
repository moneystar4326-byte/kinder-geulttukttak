// 컴퓨터판 OpenAI 어댑터를 휴대폰에서 그대로 쓰기 위한 껍데기.
// 키는 관장님 본인 것이고 휴대폰 보안 저장소에만 있어서, 브라우저 실행 막기만 풀어 줌
import { OpenAI as Base } from 'openai/client';
export { toFile } from 'openai/uploads';
export * from 'openai/error';
type Opts = ConstructorParameters<typeof Base>[0];
export default class OpenAI extends Base {
  constructor(o: Opts) { super({ ...o, dangerouslyAllowBrowser: true }); }
}
