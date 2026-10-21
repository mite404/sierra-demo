import { renderToString } from "react-dom/server";
import { expect, it } from "vitest";
import { Avatar, AvatarFallback } from "@yaklabs/ui/components/avatar";
import { Badge } from "@yaklabs/ui/components/badge";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@yaklabs/ui/components/sidebar";
import { Tabs, TabsList, TabsTrigger } from "@yaklabs/ui/components/tabs";
import { ToggleGroup, ToggleGroupItem } from "@yaklabs/ui/components/toggle-group";

const html = renderToString(
  <div>
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarContent>
          <SidebarGroup>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton>First thread</SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton>Second thread</SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
    </SidebarProvider>
    <Tabs defaultValue="thread">
      <TabsList>
        <TabsTrigger value="thread">Thread</TabsTrigger>
        <TabsTrigger value="canvas">Canvas</TabsTrigger>
      </TabsList>
    </Tabs>
    <ToggleGroup>
      <ToggleGroupItem value="thread">Thread</ToggleGroupItem>
      <ToggleGroupItem value="canvas">Canvas</ToggleGroupItem>
    </ToggleGroup>
    <Avatar>
      <AvatarFallback>K</AvatarFallback>
    </Avatar>
    <Badge>New</Badge>
  </div>,
);

it("renders the sidebar, tabs, toggle group, avatar and badge with their data-slot", () => {
  expect(html).toContain('data-slot="sidebar"');
  expect(html).toContain('data-slot="sidebar-content"');
  expect(html).toContain('data-slot="sidebar-group"');
  expect(html).toContain('data-slot="sidebar-menu"');
  expect(html).toContain('data-slot="sidebar-menu-item"');
  expect(html).toContain('data-slot="sidebar-menu-button"');
  expect(html).toContain('data-slot="tabs"');
  expect(html).toContain('data-slot="tabs-list"');
  expect(html).toContain('data-slot="tabs-trigger"');
  expect(html).toContain('data-slot="toggle-group"');
  expect(html).toContain('data-slot="toggle-group-item"');
  expect(html).toContain('data-slot="avatar"');
  expect(html).toContain('data-slot="avatar-fallback"');
  expect(html).toContain('data-slot="badge"');
});
