const sql = require('mssql');
const axios = require('axios')
const Redis = require('ioredis')
// sqlserver数据库连接配置
const dbConfig = {
  user: "sa",
  password: "admin@123",
  server: "172.16.62.74",
  database: "StackOverflow",
  port: 1433,
  pool: {
      max: 1000,
      min: 0,
			acquireTimeoutMillis: 30000,
  		idleTimeoutMillis: 30000,
  },
	options: {
    encrypt: true, // for azure
    trustServerCertificate: true, // change to true for local dev / self-signed certs,
		requestTimeout:30000
  }
};


// 翻译，将英文标题翻译成中文标题
async function transCn(enTitle, postId){
  try {
    let transResult = await axios.post('https://free.niutrans.com/NiuTransServer/translation', {
      "from":"en",
      "to":"zh",
      "apikey": "9731570c3736a668077b1d6f686df69a",
      "src_text": `${enTitle}`,
      "dictNo":"",
      "memoryNo":""
    })
    // console.log(`${postId}翻译结果`,transResult.data.tgt_text, transResult.data)
    if(!transResult.data.tgt_text) {
      console.log(`翻译出现问题：返回原来的值`)
      return enTitle
    }
    return transResult.data.tgt_text || ""
  } catch (error) {
    console.log(`${postId}翻译出错`, enTitle, error)
    return enTitle
  }
}

// 获取中文body
async function getCnBody(body) {
	const queue = []
	// 取出所有的pre标签内容
	if(typeof body === "string") {
    if(body.length > 5000) { return body }
		while(
      (body.indexOf("<pre") !== -1 && body.indexOf("</pre>")!==-1) ||
      (body.indexOf("<code") !== -1 && body.indexOf("</code>")!==-1) ||
      (body.indexOf("<strong") !== -1 && body.indexOf("</strong>")!==-1)
    ) {
			let codeStart = body.indexOf("<code")
      let preStart = body.indexOf("<pre")
      let strongStart = body.indexOf("<strong")

      let codeEnd = body.indexOf("</code>") + 7
			let preEnd = body.indexOf("</pre>") + 6
      let strongEnd = body.indexOf("</strong>") + 9

      let start,end
      if(
        (codeStart==-1 && strongStart==-1 && preStart!==-1) ||
        (preStart!==-1 && strongStart==-1 && preStart < codeStart) ||
        (preStart!==-1 && codeStart==-1 && preStart < strongStart) ||
        (preStart!==-1 && codeStart!==-1 && strongStart!==-1 && preStart < strongStart && preStart < codeStart)
      ) {
        start = preStart
        end = preEnd
      }
      if(
        (preStart==-1 && strongStart==-1 && codeStart!==-1) ||
        (codeStart!==-1 && strongStart==-1 && codeStart < preStart) ||
        (codeStart!==-1 && preStart==-1 && codeStart < strongStart) ||
        (codeStart!==-1 && strongStart!==-1 && preStart!==-1 && codeStart < strongStart && codeStart < preStart)
      ) {
        start = codeStart
        end = codeEnd
      }

      if(
        (codeStart==-1 && preStart==-1 && strongStart!==-1) ||
        (strongStart!==-1 && preStart==-1 && strongStart < codeStart) ||
        (strongStart!==-1 && codeStart==-1 && strongStart < preStart) ||
        (strongStart!==-1 && codeStart!==-1 && strongStart!==-1 && strongStart < preStart && strongStart < codeStart)
      ) {
        start = strongStart
        end = strongEnd
      }

			let temp = body.slice(start, end)
			let sign = `@${queue.length}`
			body = body.replace(`${temp}`, `${sign}`)
			queue.push({sign:`${sign}`, value: `${temp}`})
		}
		let result = await transCn(body, 1)
		let data = `${result}`
		while(queue.length) {
			let context = queue.shift()
			data = data.replace(`${context.sign}`, `${context.value}`)
		}
    let transResult = data
		return transResult
	}
	return null
}

async function getStartAndEnd(){
  try {
   let today = new Date()
   let str = today.Format("yyyy-MM-dd")
   let todayStr = `${str} 00:00:00`
   let todayZero = new Date(todayStr)
   let beforeYesterDayParse = Date.parse(todayZero) /1000 - 86400*2
   let beforeYesterday = new Date(beforeYesterDayParse*1000)
   let beforeYesterdayStr = beforeYesterday.Format("yyyy-MM-dd")

   data = await global.pool.request()
   .input('time',sql.NVarChar(110),`${beforeYesterdayStr}`)
   .query(`select * from Intervals where Time=@time`)

   if(data.recordset && data.recordset.length!==0) {
       return [data.recordset[0].Start, data.recordset[0].Tail, data.recordset[0].Count]
   }  else {
       return []
   }
  } catch (error) {
   console.log("获取起点和终点出错",error)
   return []
  }
}

// sqlserver操作
async function upDateSql(id){
  try {
    // 0. 如果数据库已经存在，直接跳过
    data = await global.pool.request()
    .input('id',sql.Int,id)
    .query(`select Id from Posts where Id=@id`)

    if(data.recordset && data.recordset.length!==0) {
      console.log(`数据库已存在${id}，跳过`)
      await global.redis.set("postid", id)
      return
    }

    // 1. 请求数据，判断post是回答还是问题
    let post = await axios.get(`https://api.stackexchange.com/2.2/posts/${id}?key=05PRPnW)tB0oqblvcgxm4Q((&site=stackoverflow&filter=!SV_dAhTh6Fb9EDcR0b`)
    // if(post.status !== 200) {
    //   console.log(`${id}请求失败，退出程序`)
    //   process.exit()
    // }
    if(post.status === 200 && post.data.items.length === 0){
      console.log(`${id}不存在`)
      await global.redis.set("postid", id)
      return
    }

    // 2. 判断是问题还是回答
    let isAnsOrQues = post.data.items[0].post_type
    console.log(`${id}是${isAnsOrQues}`)
    if(isAnsOrQues === "answer") {
      // 如果是回答
      let request = await axios.get(`https://api.stackexchange.com/2.2/answers/${id}?key=05PRPnW)tB0oqblvcgxm4Q((&site=stackoverflow&filter=!B8mctJKbuuToAuP9JtN6caIKMW6QY5`)
      // if(request.status !== 200) {
      //   console.log(`${id}请求失败，退出程序`)
      //   process.exit()
      // }
      if(request.status === 200 && request.data.items.length === 0){
        console.log(`${id}不存在`)
        await global.redis.set("postid", id)
        return
      }

      let result = request.data
      let data = result.items[0]

      // 2. 开始拼凑所需要的数据
      let Id = data.answer_id
      let AcceptedAnswerId = 0
      let AnswerCount = 0
      let Body = data.body
      let CnBody = await getCnBody(data.body, Id)
      let ClosedDate = null
      let CommentCount = data.comment_count || 0
      let CommunityOwnedDate = null
      let CreationDate = data.creation_date? new Date(data.creation_date*1000): null
      let FavoriteCount = 0
      let LastActivityDate = data.last_activity_date? new Date(data.last_activity_date*1000) : null
      let LastEditDate = data.last_edit_date ? new Date(data.last_edit_date*1000) : null
      let LastEditorDisplayName = data.last_editor ? data.last_editor.display_name? data.last_editor.display_name.slice(0, 40) : null : null
      let LastEditorUserId = data.last_editor ? data.last_editor.user_id? data.last_editor.user_id : 0 : 0
      let OwnerUserId = data.owner ? data.owner.user_id? data.owner.user_id : 0 : 0
      let ParentId = data.question_id
      let PostTypeId = 2
      let Score = data.score
      let Tags = null
      let Title = null
      let ViewCount = 0
      let CnTitle = null


      // 开始写入数据库
       data = await global.pool.request()
      .input('Id', sql.Int, Id)
      .input('AcceptedAnswerId', sql.Int, AcceptedAnswerId)
      .input('AnswerCount', sql.Int, AnswerCount)
      .input('Body', sql.XML, Body)
      .input('ClosedDate', sql.DateTime, ClosedDate)
      .input('CommentCount', sql.Int, CommentCount)
      .input('CommunityOwnedDate', sql.DateTime, CommunityOwnedDate)
      .input('CreationDate', sql.DateTime, CreationDate)
      .input('FavoriteCount', sql.Int, FavoriteCount)
      .input('LastActivityDate', sql.DateTime, LastActivityDate)
      .input('LastEditDate', sql.DateTime, LastEditDate)
      .input('LastEditorDisplayName', sql.NVarChar(40), LastEditorDisplayName)
      .input('LastEditorUserId', sql.Int, LastEditorUserId)
      .input('OwnerUserId', sql.Int, OwnerUserId)
      .input('ParentId', sql.Int, ParentId)
      .input('PostTypeId', sql.Int, PostTypeId)
      .input('Score', sql.Int, Score)
      .input('Tags', sql.NVarChar(150), Tags)
      .input('Title', sql.NVarChar(250), Title)
      .input('ViewCount', sql.Int, ViewCount)
      .input('CnTitle', sql.XML, CnTitle)
      .input('CnBody', sql.XML, CnBody)
      .query(`SET IDENTITY_INSERT Posts ON;INSERT INTO  Posts 
        (Id,AcceptedAnswerId,AnswerCount,Body,ClosedDate,CommentCount,CommunityOwnedDate,CreationDate,FavoriteCount,LastActivityDate,LastEditDate,LastEditorDisplayName,LastEditorUserId,
          OwnerUserId,ParentId,PostTypeId,Score,Tags,Title,ViewCount,CnTitle,CnBody)
        VALUES (@Id,@AcceptedAnswerId,@AnswerCount,@Body,@ClosedDate,@CommentCount,@CommunityOwnedDate,@CreationDate,@FavoriteCount,@LastActivityDate,@LastEditDate,@LastEditorDisplayName,@LastEditorUserId,
          @OwnerUserId,@ParentId,@PostTypeId,@Score,@Tags,@Title,@ViewCount,@CnTitle,@CnBody) ;
        SET IDENTITY_INSERT Posts off`
      )
      console.log(`${id}更新成功`)
      await global.redis.set("postid", id)

    } else if(isAnsOrQues === "question") {
      // 如果是问题
      let request = await axios.get(`https://api.stackexchange.com/2.2/questions/${id}?key=05PRPnW)tB0oqblvcgxm4Q((&site=stackoverflow&filter=!7hCuYsHmSLMf93P4(y9JXCW6hVDzjT.Kqn`)
      // if(request.status !== 200) {
      //   console.log(`${id}请求失败，退出程序`)
      //   process.exit()
      // }
      if(request.status === 200 && request.data.items.length === 0){
        console.log(`${id}不存在`)
        await global.redis.set("postid", id)
        return
      }

      let result = request.data
      let data = result.items[0]

      // 2. 开始拼凑所需要的数据
      let Id = data.question_id
      let AcceptedAnswerId = data.accepted_answer_id | 0
      let AnswerCount = data.answer_count
      let Body = data.body
      let CnBody = await getCnBody(data.body, Id)
      let ClosedDate = null
      let CommentCount = data.comment_count || 0
      let CommunityOwnedDate = data.community_owned_date ? new Date(data.community_owned_date*1000): null
      let CreationDate = new Date(data.creation_date*1000)
      let FavoriteCount = data.favorite_count || 0
      let LastActivityDate = data.last_activity_date? new Date(data.last_activity_date*1000): null
      let LastEditDate = data.last_edit_date ? new Date(data.last_edit_date*1000) : null
      let LastEditorDisplayName = data.last_editor ? data.last_editor.display_name? data.last_editor.display_name.slice(0, 40) : null : null
      let LastEditorUserId = data.last_editor ? data.last_editor.user_id? data.last_editor.user_id : 0 : 0
      let OwnerUserId = data.owner ? data.owner.user_id? data.owner.user_id : 0 : 0
      let ParentId = 0
      let PostTypeId = 1
      let Score = data.score
      let Tags = data.tags.length > 0 ? `<${data.tags.slice(0,3).join('><')}>` : ""
      let Title = data.title.slice(0,250)
      let ViewCount = data.view_count
      let CnTitle = await transCn(Title,id)


      // 开始写入数据库
       data = await global.pool.request()
      .input('Id', sql.Int, Id)
      .input('AcceptedAnswerId', sql.Int, AcceptedAnswerId)
      .input('AnswerCount', sql.Int, AnswerCount)
      .input('Body', sql.XML, Body)
      .input('ClosedDate', sql.DateTime, ClosedDate)
      .input('CommentCount', sql.Int, CommentCount)
      .input('CommunityOwnedDate', sql.DateTime, CommunityOwnedDate)
      .input('CreationDate', sql.DateTime, CreationDate)
      .input('FavoriteCount', sql.Int, FavoriteCount)
      .input('LastActivityDate', sql.DateTime, LastActivityDate)
      .input('LastEditDate', sql.DateTime, LastEditDate)
      .input('LastEditorDisplayName', sql.NVarChar(40), LastEditorDisplayName)
      .input('LastEditorUserId', sql.Int, LastEditorUserId)
      .input('OwnerUserId', sql.Int, OwnerUserId)
      .input('ParentId', sql.Int, ParentId)
      .input('PostTypeId', sql.Int, PostTypeId)
      .input('Score', sql.Int, Score)
      .input('Tags', sql.NVarChar(150), Tags)
      .input('Title', sql.NVarChar(250), Title)
      .input('ViewCount', sql.Int, ViewCount)
      .input('CnTitle', sql.XML, CnTitle)
      .input('CnBody', sql.XML, CnBody)
      .query(`SET IDENTITY_INSERT Posts ON;INSERT INTO  Posts 
        (Id,AcceptedAnswerId,AnswerCount,Body,ClosedDate,CommentCount,CommunityOwnedDate,CreationDate,FavoriteCount,LastActivityDate,LastEditDate,LastEditorDisplayName,LastEditorUserId,
          OwnerUserId,ParentId,PostTypeId,Score,Tags,Title,ViewCount,CnTitle,CnBody)
        VALUES (@Id,@AcceptedAnswerId,@AnswerCount,@Body,@ClosedDate,@CommentCount,@CommunityOwnedDate,@CreationDate,@FavoriteCount,@LastActivityDate,@LastEditDate,@LastEditorDisplayName,@LastEditorUserId,
          @OwnerUserId,@ParentId,@PostTypeId,@Score,@Tags,@Title,@ViewCount,@CnTitle,@CnBody) ;
        SET IDENTITY_INSERT Posts off`
      )
      console.log(`${id}更新成功`)
      await global.redis.set("postid", id)

    } else {
      console.log(`${id}既非问题也非回答`)
      await global.redis.set("postid", id)
      return
    }
  } catch (error) {
    console.log("catch error:", error)
    if(error.toString() === "Error: Request failed with status code 400") {
      await global.redis.set("postrest", 1)
    }
    process.exit()
  }


}

async function main() {
  // 连接redis
  const redis = new Redis({
    port:'6379'
    // password:123456
  })
  global.redis = redis

  let isContinue = await redis.get("postrest")
  if(Number(isContinue) === 1) {
    console.log("post正在休息")
    process.exit()
  }


  // 连接sqlserver
  let pool = await sql.connect(dbConfig)
  global.sql = sql;
  global.pool = pool

  let startAndEnd = await getStartAndEnd()
  if(startAndEnd.length===0) {
    console.log("未查询到起点和终点")
    process.exit()
  }

  let count = Math.floor(startAndEnd[2] / 4)

  let startId = startAndEnd[0] + 1*count    // 区间起点
  let endId = startAndEnd[1] +  2*count // 区间重点
  let postId = await redis.get("postid") // 当前数据库末尾处
  let start
  if(postId < startId) {
    start = startId -1
  } else {
    start = postId
  }
  console.log(`区间${startId}-${endId},当前位置为：${start}`)

  let i = Number(start)+1
  if(i > endId) {
    console.log("程序到达终点，开始休息")
    await global.redis.set("postrest", 1)
    process.exit()
  }
  setInterval(async ()=> {
    await upDateSql(i)
    i = i+1
  }, 8000)

}



Date.prototype.Format = function (fmt) { //author: meizz
  var o = {
      "M+": this.getMonth() + 1, //月份
      "d+": this.getDate(), //日
      "h+": this.getHours(), //小时
      "m+": this.getMinutes(), //分
      "s+": this.getSeconds(), //秒
      "q+": Math.floor((this.getMonth() + 3) / 3), //季度
      "S": this.getMilliseconds() //毫秒
  };
  if (/(y+)/.test(fmt)) fmt = fmt.replace(RegExp.$1, (this.getFullYear() + "").substr(4 - RegExp.$1.length));
  for (var k in o)
      if (new RegExp("(" + k + ")").test(fmt)) fmt = fmt.replace(RegExp.$1, (RegExp.$1.length == 1) ? (o[k]) : (("00" + o[k]).substr(("" + o[k]).length)));
  return fmt;
};

main()