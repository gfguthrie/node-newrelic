'use strict'

var shimmer = require('../shimmer')
var parseSql = require('../db/parse-sql')
var MSSQL = require('../metrics/names').MSSQL

module.exports = function initialize(agent, tedious) {
  var tracer = agent.tracer

  shimmer.wrapMethod(
    tedious && tedious.Connection && tedious.Connection.prototype,
    'tedious.Connection.prototype',
    'callProcedure',
    function nrCallProcedureWrapper(original) {
      return tracer.wrapFunction(
        MSSQL.STATEMENT + 'Unknown',
        null,
        original,
        wrapRequest
      )
    }
  )

  function wrapRequest(segment, args, bind) {
    var transaction = tracer.getTransaction()
    var request = args[0]

    // Attempt to get the statement, this probably only works for `execSql`
    var statement =  ''

    if (request && request.sqlTextOrProcedure) {
      statement = 'sp ' + request.sqlTextOrProcedure
    }

	var ps = parseSql(MSSQL.PREFIX, statement)
    transaction.addRecorder(ps.recordMetrics.bind(ps, segment))
    segment.name = MSSQL.STATEMENT + (ps.model || 'unknown') + '/' + ps.operation

    // capture connection info for datastore instance metric
    segment.port = this.config.options.port
    segment.host = this.config.server

    // find and wrap the callback
    if (request && typeof request.userCallback === 'function') {
      request.userCallback = bind(request.userCallback)
    }

    return args
  }
}
