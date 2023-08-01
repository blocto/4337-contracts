import { debugTransaction } from './debugTx'
import { expect } from 'chai'

export async function checkForBannedOps (txHash: string, checkPaymaster: boolean): Promise<void> {
  const tx = await debugTransaction(txHash)
  const logs = tx.structLogs
  const blockHash = logs.map((op, index) => ({ op: op.op, index })).filter(op => op.op === 'NUMBER')
  expect(blockHash.length).to.equal(2, 'expected exactly 2 call to NUMBER (Just before and after validateUserOperation)')
  const validateAccountOps = logs.slice(0, blockHash[0].index - 1)
  const validatePaymasterOps = logs.slice(blockHash[0].index + 1)
  const ops = validateAccountOps.filter(log => log.depth > 1).map(log => log.op)
  const paymasterOps = validatePaymasterOps.filter(log => log.depth > 1).map(log => log.op)

  expect(ops).to.include('POP', 'not a valid ops list: ' + JSON.stringify(ops)) // sanity
  const bannedOpCodes = new Set(['GAS', 'BASEFEE', 'GASPRICE', 'NUMBER'])
  expect(ops.filter((op, index) => {
    // don't ban "GAS" op followed by "*CALL"
    if (op === 'GAS' && (ops[index + 1].match(/CALL/) != null)) {
      return false
    }
    return bannedOpCodes.has(op)
  })).to.eql([])
  if (checkPaymaster) {
    expect(paymasterOps).to.include('POP', 'not a valid ops list: ' + JSON.stringify(paymasterOps)) // sanity
    expect(paymasterOps).to.not.include('BASEFEE')
    expect(paymasterOps).to.not.include('GASPRICE')
    expect(paymasterOps).to.not.include('NUMBER')
  }
}
