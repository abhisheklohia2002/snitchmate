const http=require('node:http');
let calls=0;
const server=http.createServer(async(req,res)=>{
 if(req.url==='/health'){res.writeHead(200);res.end('ok');return;}
 if(req.method!=='POST'||req.url!=='/v1/responses'){res.writeHead(404);res.end();return;}
 let body='';
 for await(const chunk of req){body+=chunk;if(body.length>120000){res.writeHead(413);res.end();return;}}
 let request;try{request=JSON.parse(body);}catch{res.writeHead(400);res.end();return;}
 const userContent=request.input?.find(x=>x.role==='user')?.content||[];
 const text=userContent.filter(x=>x.type==='input_text').map(x=>x.text).join(' ');
 const hasImage=userContent.some(x=>x.type==='input_image');
 if(!request.text?.format?.schema||!request.store===false){/* Validate mock's structured route below. */}
 if(text.includes('simulate-timeout')){await new Promise(resolve=>setTimeout(resolve,5000));res.writeHead(503);res.end();return;}
 if(text.includes('simulate-rate-limit')){res.writeHead(429,{'content-type':'application/json'});res.end(JSON.stringify({error:{type:'rate_limit_error',message:'AI capacity limited'}}));return;}
 if(text.includes('simulate-invalid-output')){
  res.writeHead(200,{'content-type':'application/json'});
  res.end(JSON.stringify({id:'resp_mock',object:'response',created_at:Date.now(),model:'gpt-5-mini',status:'completed',output:[{id:'msg_mock',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'{"reply":false}',annotations:[]}]}],usage:{input_tokens:120,output_tokens:12,total_tokens:132}}));return;
 }
 calls++;
 const outfit=text.toLowerCase().includes('jeans')?'Jeans':'Blouse';
 const result={
  reply:hasImage?'The visible reference suggests a neckline detail, but fabric and measurements need confirmation. Please review the brief.':'I can help with the tailoring plan. Review the real gigs and confirm your garment details.',
  requirements:{
   garmentType:outfit,serviceType:outfit==='Jeans'?'ALTERATION':'CUSTOM_STITCHING',occasion:'Wedding',
   budgetMax:2000,preferredDeliveryDays:7,pincode:'110086',
   design:{neckline:hasImage?'Square neck':null,sleeveType:'Full sleeves',embroidery:'Light embroidery',color:'Blue',silhouette:'Fitted'},
   additionalInstructions:'Please stitch a designer blouse with fitted sleeves and a square neckline.',
   uncertainty:hasImage?['Fabric composition and back details cannot be confirmed from photo']:[],
   missingInformation:['measurements']
  }
 };
 res.writeHead(200,{'content-type':'application/json'});
 res.end(JSON.stringify({id:'resp_mock_'+calls,object:'response',created_at:Math.floor(Date.now()/1000),model:'gpt-5-mini',status:'completed',
  output:[{id:'message_'+calls,type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:JSON.stringify(result),annotations:[]}]}],
  usage:{input_tokens:150,output_tokens:160,total_tokens:310}
 }));
});
server.listen(4019,'127.0.0.1',()=>console.log('Isolated OpenAI mock ready on localhost:4019'));
