'use strict';

const RUN_MODULE = '../src/career/run';

describe('契约源文件缺失时的报错', () => {
  test('把 ENOENT 翻成一句人话的中文错误', () => {
    const { describeContractSourceError } = require(RUN_MODULE);
    const raw = Object.assign(new Error('ENOENT: no such file or directory'), {
      code: 'ENOENT',
      path: 'D:/repo/docs/CAREER_SCHEMA.md',
    });
    const err = describeContractSourceError(raw);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain('契约源文件缺失');
    // 必须点名那个绝对路径，运维一眼知道少了什么
    expect(err.message).toContain('D:/repo/docs/CAREER_SCHEMA.md');
    // 必须说清是打包漏了仓库根的 docs/
    expect(err.message).toContain('docs/');
    expect(err.message).not.toMatch(/ENOENT/);
  });

  test('不是 ENOENT 的错误原样抛出（不吞异常）', () => {
    const { describeContractSourceError } = require(RUN_MODULE);
    const raw = new Error('契约源文件里找不到机读契约块');
    expect(describeContractSourceError(raw)).toBe(raw);
  });

  /**
   * 端到端：契约源真的读不到时，加载阶段二编排必须抛**中文**错误，
   * 而不是裸 ENOENT —— 否则部署只打包 backend/ 时运维看到的是一坨路径栈。
   */
  test('契约源读不到时，加载 career/run 抛的是中文错误', () => {
    jest.resetModules();
    jest.doMock('fs', () => {
      const real = jest.requireActual('fs');
      return {
        ...real,
        readFileSync(p, ...rest) {
          if (String(p).endsWith('CAREER_SCHEMA.md')) {
            const err = new Error(`ENOENT: no such file or directory, open '${p}'`);
            err.code = 'ENOENT';
            err.path = String(p);
            throw err;
          }
          return real.readFileSync(p, ...rest);
        },
      };
    });
    let thrown = null;
    try {
      jest.isolateModules(() => {
        require(RUN_MODULE);
      });
    } catch (e) {
      thrown = e;
    } finally {
      jest.dontMock('fs');
      jest.resetModules();
    }
    expect(thrown).not.toBeNull();
    expect(thrown.message).toContain('契约源文件缺失');
    expect(thrown.message).toMatch(/[一-龥]/);
    expect(thrown.message).not.toMatch(/ENOENT/);
  });
});
