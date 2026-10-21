import assert from "node:assert/strict";
import { test } from "node:test";
import { POST as claim } from "../app/api/generator-worker/claim/route";
import { POST as upload } from "../app/api/generator-worker/upload/route";
import { POST as complete } from "../app/api/generator-worker/complete/route";
import { POST as cleanup } from "../app/api/generator-worker/cleanup/route";
import { musicRpcRow, tokenHash } from "../utils/music-cloud";

const owner="00000000-0000-0000-0000-000000000001", id="11111111-1111-4111-a111-111111111111", lease="22222222-2222-4222-a222-222222222222", worker="33333333-3333-4333-a333-333333333333";
const token="emw_"+"A".repeat(64);
const request=(body:unknown={},auth=true)=>new Request("https://evolutionmedia.vercel.app/api/generator-worker/test",{method:"POST",headers:{"content-type":"application/json",...(auth?{authorization:"Bearer "+token}:{})},body:JSON.stringify(body)});
const json=(value:unknown)=>new Response(JSON.stringify(value),{headers:{"content-type":"application/json"}});
test("composite RPC results accept singular and table representations without accepting multiple rows",()=>{
  assert.deepEqual(musicRpcRow({id}),{id});
  assert.deepEqual(musicRpcRow([{id}]),{id});
  assert.equal(musicRpcRow([]),null);assert.equal(musicRpcRow([{id},{id}]),null);
});
test("worker HTTP handlers authenticate, bind upload paths and leases, whitelist results and preserve idempotency", async()=>{
  const originalFetch=globalThis.fetch;
  const previousUrl=process.env.NEXT_PUBLIC_SUPABASE_URL, previousKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL="https://project.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY="synthetic_service_key_for_local_tests_only";
  let status="running", validLease=true, finishCount=0, signedPath="", finished:Record<string,unknown>|undefined;
  let revoked=false, callCount=0;
  globalThis.fetch=async(input,init)=>{
    callCount++;
    const url=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url);
    const headers=new Headers(init?.headers);
    assert.equal(headers.get("apikey"),process.env.SUPABASE_SERVICE_ROLE_KEY);
    if(url.pathname==="/rest/v1/music_workers"){
      assert.equal(url.searchParams.get("secret_hash"),"eq."+tokenHash(token));
      return json(revoked?null:{id:worker,owner_id:owner});
    }
    if(url.pathname==="/rest/v1/music_recordings"){
      assert.equal(url.searchParams.get("owner_id"),"eq."+owner);
      if(url.searchParams.get("status")==="eq.deleted") return json([{id}]);
      if(url.searchParams.get("lease_id") && !validLease) return json(null);
      return json({id,owner_id:owner,worker_id:worker,lease_id:lease,status,origin:"cloud"});
    }
    if(url.pathname==="/rest/v1/rpc/claim_music_recording") return json([{id,owner_id:owner,moment:"Hope",duration:240,genre:"soul",kind:"vocal",lease_id:lease,secret_hash:"NEVER_RETURN"}]);
    if(url.pathname.startsWith("/storage/v1/object/upload/sign/")){
      signedPath=url.pathname;
      return json({url:url.pathname.replace("/storage/v1", "")+"?token=scoped"});
    }
    if(url.pathname.startsWith("/storage/v1/object/generated-music/")) return new Response(new Blob(["ID3test"],{type:"audio/mpeg"}));
    if(url.pathname==="/rest/v1/rpc/finish_music_recording"){
      finished=JSON.parse(String(init?.body)); finishCount++; return json(true);
    }
    throw new Error("Unexpected mocked Supabase path: "+url.pathname);
  };
  try{
    for(const handler of [claim,upload,complete,cleanup]) assert.equal((await handler(request({},false))).status,401);
    assert.equal(callCount,0);
    revoked=true;assert.equal((await claim(request())).status,401);revoked=false;
    const claimed=await(await claim(request())).json();
    assert.equal(claimed.job.duration,240);assert.equal(claimed.job.secret_hash,undefined);
    const invalid=await upload(request({job_id:"../other",lease_id:lease})); assert.equal(invalid.status,409);
    validLease=false;assert.equal((await upload(request({job_id:id,lease_id:lease}))).status,409);validLease=true;
    const uploaded=await upload(request({job_id:id,lease_id:lease,owner_id:"foreign"}));
    assert.equal(uploaded.status,200);
    assert.equal((await uploaded.json()).upload_url,`https://project.supabase.co/storage/v1/object/upload/sign/generated-music/${owner}/${id}/track.mp3?token=scoped`);
    assert.equal(signedPath,`/storage/v1/object/upload/sign/generated-music/${owner}/${id}/track.mp3`);
    assert.equal((await complete(request({job_id:id,lease_id:lease,result:{lyrics:"Short",actual_duration:90}}))).status,400);
    const response=await complete(request({job_id:id,lease_id:lease,result:{lyrics:"Full original lyrics",actual_duration:240.02,path:"/private/local",worker_token:token,engine:"ace-step"}}));
    assert.equal(response.status,200);assert.equal(finishCount,1);
    assert.deepEqual(finished?.p_result,{lyrics:"Full original lyrics",actual_duration:240.02,engine:"ace-step"});
    status="completed";
    assert.equal((await complete(request({job_id:id,lease_id:lease}))).status,200);
    assert.equal(finishCount,1,"lost reply does not finalize twice");
    assert.deepEqual(await(await cleanup(request())).json(),{deleted_ids:[id]});
    assert.equal((await cleanup(request({after:"../../private"}))).status,400);
  }finally{
    globalThis.fetch=originalFetch;
    if(previousUrl===undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=previousUrl;
    if(previousKey===undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=previousKey;
  }
});
