"use client";

import { useEffect, useState } from "react";
import { MessageCircle, Send, ChevronDown, ChevronUp, LoaderCircle } from "lucide-react";

type Audience = "customer" | "photographer" | "owner";
type ThreadMessage = { message_id:string; sender_type:string; sender_name:string; body:string; created_at:string };
type Props = { enquiryId:string; audience:Audience; defaultOpen?:boolean };

export function ClientEnquiryThread({ enquiryId, audience, defaultOpen=false }:Props) {
  const [open,setOpen]=useState(defaultOpen);
  const [messages,setMessages]=useState<ThreadMessage[]>([]);
  const [body,setBody]=useState("");
  const [loading,setLoading]=useState(false);
  const [sending,setSending]=useState(false);
  const [error,setError]=useState("");
  const [loaded,setLoaded]=useState(false);
  const endpoint = audience==="customer"
    ? "/api/public/enquiries/"+encodeURIComponent(enquiryId)+"/messages"
    : audience==="photographer"
      ? "/api/photographer/enquiries/"+encodeURIComponent(enquiryId)+"/messages"
      : "/api/owner/enquiries/"+encodeURIComponent(enquiryId)+"/messages";

  async function loadMessages() {
    setLoading(true);setError("");
    try {
      const response=await fetch(endpoint,{cache:"no-store"});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||"Conversation could not be loaded.");
      setMessages(Array.isArray(data.messages)?data.messages:[]);
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error?e.message:"Conversation could not be loaded.");
    } finally { setLoading(false); }
  }
  useEffect(()=>{if(open)void loadMessages();},[open,endpoint]);

  async function sendMessage(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message=body.trim();
    if(!message||sending)return;
    setSending(true);setError("");
    try {
      const response=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({body:message})});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||"Message could not be sent.");
      setBody("");
      await loadMessages();
    } catch (e) {
      setError(e instanceof Error?e.message:"Message could not be sent.");
    } finally { setSending(false); }
  }

  const customer = audience==="customer";
  const title = customer ? "Your private conversation" : "Private client conversation";
  return <section style={{marginTop:14,border:"1px solid #d9d2c5",borderRadius:7,background:"#faf8f3",overflow:"hidden"}}>
    <button type="button" onClick={()=>setOpen(v=>!v)} aria-expanded={open} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,padding:"12px 14px",border:0,background:"transparent",color:"#292821",cursor:"pointer",textAlign:"left"}}>
      <span style={{display:"flex",alignItems:"center",gap:9,fontSize:13,fontWeight:700}}><MessageCircle size={16}/>{title}</span>
      <span style={{display:"flex",alignItems:"center",gap:8,fontSize:11,color:"#777064"}}>{loaded?messages.length+" messages":"Open thread"}{open?<ChevronUp size={16}/>:<ChevronDown size={16}/>}</span>
    </button>
    {open&&<div style={{padding:"0 14px 14px"}}>
      <div style={{borderTop:"1px solid #e4ded3",paddingTop:12}}>
        {loading?<p style={{fontSize:12,color:"#777064",display:"flex",alignItems:"center",gap:7}}><LoaderCircle size={14}/> Loading conversation…</p>:messages.length===0?<p style={{fontSize:12,color:"#777064"}}>No messages yet. Start the conversation below.</p>:<div style={{display:"grid",gap:9,maxHeight:360,overflowY:"auto",padding:"2px 2px 12px"}}>
          {messages.map(message=>{
            const mine=(audience==="customer"&&message.sender_type==="customer")||(audience==="photographer"&&message.sender_type==="photographer")||(audience==="owner"&&message.sender_type==="admin");
            return <article key={message.message_id} style={{justifySelf:mine?"end":"start",width:"min(92%,560px)",padding:"10px 12px",border:"1px solid "+(mine?"#d8c8a9":"#e2ddd4"),background:mine?"#f2eadb":"#fff",borderRadius:7}}>
              <div style={{display:"flex",justifyContent:"space-between",gap:10,flexWrap:"wrap",fontSize:10,color:"#766b59",marginBottom:6}}><strong>{message.sender_name}</strong><time>{new Date(message.created_at).toLocaleString("en-KE",{dateStyle:"medium",timeStyle:"short"})}</time></div>
              <p style={{fontSize:13,lineHeight:1.65,whiteSpace:"pre-wrap",overflowWrap:"anywhere",margin:0,color:"#39362f"}}>{message.body}</p>
            </article>;
          })}
        </div>}
        {error&&<p role="alert" style={{fontSize:12,color:"#9a3d32",margin:"8px 0"}}>{error}</p>}
        <form onSubmit={sendMessage} style={{display:"grid",gap:8}}>
          <label htmlFor={"client-message-"+enquiryId} style={{fontSize:11,fontWeight:700,color:"#625c51"}}>Write a reply</label>
          <textarea id={"client-message-"+enquiryId} value={body} onChange={e=>setBody(e.target.value)} maxLength={4000} rows={3} placeholder="Write your message…" required style={{width:"100%",boxSizing:"border-box",resize:"vertical",padding:11,border:"1px solid #d4cec3",borderRadius:5,background:"#fff",font:"inherit",fontSize:13}}/>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            <small style={{fontSize:10,color:"#81796d"}}>{body.length}/4,000 characters · Messages are private to this enquiry</small>
            <button type="submit" disabled={sending||!body.trim()} style={{display:"inline-flex",alignItems:"center",gap:7,padding:"9px 13px",border:0,borderRadius:4,background:"#292821",color:"#fff",fontSize:12,cursor:"pointer",opacity:sending||!body.trim()?0.55:1}}>{sending?"Sending…":"Send reply"} <Send size={13}/></button>
          </div>
        </form>
      </div>
    </div>}
  </section>;
}
