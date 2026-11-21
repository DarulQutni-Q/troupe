// Lists the test files vitest runs (its `test.include` over `git ls-files`),
// so `bun test --files-from` gets the same set and cannot drift from vitest.
//   bun scripts/ci/test-files.ts                     print the list
//   bun scripts/ci/test-files.ts --check <junit.xml> fail unless every listed file has a suite in the report
import config from '../../vitest.config'

const include = config.test?.include
if (!include?.length) throw new Error('vitest.config.ts has no test.include')
const globs = include.map((pattern) => new Bun.Glob(pattern))

const tracked = (await Bun.$`git ls-files -z`.text()).split('\0').filter(Boolean)
const files = tracked.filter((file) => globs.some((glob) => glob.match(file))).sort()

const [flag, junitPath] = process.argv.slice(2)
if (flag === undefined) {
  console.log(files.join('\n'))
} else if (flag === '--check' && junitPath) {
  const junit = await Bun.file(junitPath).text()
  const reported = new Set(
    Array.from(junit.matchAll(/<testsuite [^>]*\bfile="([^"]+)"/g), (m) => m[1])
  )
  const missing = files.filter((file) => !reported.has(file))
  console.log(
    `${files.length - missing.length}/${files.length} listed files have a suite in ${junitPath}`
  )
  if (missing.length > 0) {
    for (const file of missing) console.log(`missing: ${file}`)
    process.exit(1)
  }
} else {
  console.error('usage: bun scripts/ci/test-files.ts [--check <junit.xml>]')
  process.exit(2)
}
