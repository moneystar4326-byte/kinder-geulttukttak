export const basename = (p: string) => p.split(/[\/]/).pop() ?? p;
export const join = (...p: string[]) => p.join('/');
export default { basename, join };
